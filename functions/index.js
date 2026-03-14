const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const axios = require('axios'); // Vamos usar o axios para consultar o ViaCEP
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

initializeApp();

// --- FUNÇÃO DE CRIAR PEDIDO MANTIDA INTACTA ---
exports.createorder = onCall({ region: "southamerica-east1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Precisa estar autenticado.');
    const userId = request.auth.uid;
    
    // 1. RECEBER OS NOVOS DADOS AQUI
    const { items, customer, shipping } = request.data;
    
    if (!items || items.length === 0) throw new HttpsError('invalid-argument', 'Carrinho vazio.');

    const db = getFirestore();
    let subtotalAmount = 0;

    try {
        const result = await db.runTransaction(async (transaction) => {
            const productRefs = items.map(item => db.collection('products').doc(item.id));
            const productDocs = await transaction.getAll(...productRefs);
            const itemsForOrder = [];
            const stockUpdates = [];

            for (let i = 0; i < productDocs.length; i++) {
                const productDoc = productDocs[i];
                const item = items[i];
                if (!productDoc.exists) throw new HttpsError('not-found', `Produto não encontrado.`);
                const productData = productDoc.data();
                const requestedQty = Number(item.qty);
                if (productData.stock < requestedQty) throw new HttpsError('failed-precondition', `Stock insuficiente.`);

                subtotalAmount += (productData.price * requestedQty);
                itemsForOrder.push({
                    id: productDoc.id, name: productData.name, price: productData.price, qty: requestedQty
                });
                stockUpdates.push({ ref: productDoc.ref, newStock: productData.stock - requestedQty });
            }

            stockUpdates.forEach(update => transaction.update(update.ref, { stock: update.newStock }));
            const orderRef = db.collection('orders').doc();
            
            // 2. ESTRUTURAR O DOCUMENTO COMPLETO PARA GUARDAR NA BASE DE DADOS
            const freteCusto = shipping && shipping.cost ? shipping.cost : 0;
            const orderDetails = { 
                items: itemsForOrder, 
                subtotal: subtotalAmount,
                shipping: shipping || { method: 'Nenhum', cost: 0 },
                total: subtotalAmount + freteCusto, // Soma o valor dos produtos + frete
                customer: customer || {} // Guarda os dados do formulário!
            };

            transaction.set(orderRef, { 
                userId, 
                ...orderDetails, 
                status: 'pending', 
                createdAt: Timestamp.now() 
            });
            
   // --- INTEGRAÇÃO MERCADO PAGO ---
            const client = new MercadoPagoConfig({ accessToken: 'TEST-1703928170803920-022522-76e65d6dea70c0339d6baa69736a623d-230652618' });
            const preference = new Preference(client);

            const mpResponse = await preference.create({
                body: {
                    items: [
                        {
                            id: orderRef.id,
                            title: 'Compra na Olomi',
                            quantity: 1,
                            unit_price: Number(orderDetails.total.toFixed(2))
                        }
                    ],
                    payer: {
                        name: customer.name || 'Cliente',
                        email: customer.email || 'test_user_123456@testuser.com'
                    },
                    back_urls: {
                        success: "https://olomi-428be.web.app/minha-conta.html",
                        failure: "https://olomi-428be.web.app/carrinho.html",
                        pending: "https://olomi-428be.web.app/minha-conta.html"
                    },
                    auto_return: "approved",
                    external_reference: orderRef.id 
                } // <-- Fim do objeto body
            }); // <-- Fim da chamada preference.create

            // 👉 AGORA SIM! O comando fica do lado de fora, depois de já termos a resposta do Mercado Pago
            transaction.update(orderRef, { paymentUrl: mpResponse.sandbox_init_point }); 

            // Retorna o link de pagamento de teste (sandbox) para o site
            return { 
                orderId: orderRef.id, 
                orderDetails, 
                checkoutUrl: mpResponse.sandbox_init_point 
            };
        }); // Fim da transaction
        return result;
    } catch (error) {
        throw new HttpsError('internal', error.message || 'Erro ao processar pedido.');
    }
});

// --- NOVA FUNÇÃO DE FRETE (DINÂMICA E ANTI-BLOQUEIO) ---
// --- NOVA FUNÇÃO DE FRETE (API SUPERFRETE REAL) ---
exports.calcularfrete = onCall({ region: "southamerica-east1" }, async (request) => {
    const { cepDestino, items } = request.data;

    if (!cepDestino || !items || items.length === 0) {
        throw new HttpsError('invalid-argument', 'CEP e itens são obrigatórios.');
    }

    // 1. CUBAGEM INTELIGENTE (Simulando uma única caixa para todos os itens)
    let pesoTotal = 0;
    let alturaTotal = 0;
    let maiorLargura = 0;
    let maiorComprimento = 0;

    items.forEach(item => {
        const qty = item.qty || 1;
        // Soma os pesos
        pesoTotal += (parseFloat(item.weight) || 0.5) * qty;
        // Empilha os produtos (soma as alturas)
        alturaTotal += (parseFloat(item.height) || 15) * qty;
        // Pega a maior largura e comprimento para a base da caixa
        maiorLargura = Math.max(maiorLargura, (parseFloat(item.width) || 20));
        maiorComprimento = Math.max(maiorComprimento, (parseFloat(item.length) || 20));
    });

    // O SuperFrete exige dimensões mínimas aceitas pelos Correios (Ex: Altura mínima 2cm)
    const payloadSuperFrete = {
        from: { postal_code: "20766720" }, // O seu CEP de Origem (RJ)
        to: { postal_code: cepDestino.replace(/\D/g, '') },
        package: {
            weight: Math.max(0.1, pesoTotal), // Peso mínimo 100g
            height: Math.max(2, alturaTotal), // Altura mínima 2cm
            width: Math.max(11, maiorLargura), // Largura mínima 11cm
            length: Math.max(16, maiorComprimento) // Comprimento mínimo 16cm
        }
    };

    try {
        // 2. CHAMADA OFICIAL À API DO SUPERFRETE
        // 👉 ATENÇÃO: COLOQUE O SEU TOKEN DO SUPERFRETE NA LINHA ABAIXO
        const SUPERFRETE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzM1MDM0OTEsInN1YiI6IkxFczJNa0kyUENhVVZOZnhhRjhma2FDQ0gyQjMifQ.WeF19JgJWGIHKHdQzN9NVlQ-dp4KQjFHkLY_diHz6IM';

        const response = await axios.post(
            'https://www.superfrete.com/api/v0/calculator', 
            payloadSuperFrete,
            {
                headers: {
                    'Authorization': `Bearer ${SUPERFRETE_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );

        // 3. RETORNA OS DADOS REAIS PARA O FRONTEND
        // O SuperFrete devolve um Array com todas as transportadoras.
        // O seu carrinho.js vai receber isto e filtrar apenas os 'Correios'.
        return response.data;

    } catch (error) {
        logger.error("Erro na API do SuperFrete:", error.response?.data || error.message);
        throw new HttpsError('internal', 'Falha ao conectar com a transportadora. Tente novamente.');
    }
});


// --- WEBHOOK DO MERCADO PAGO ---
exports.webhookpagamento = onRequest(async (req, res) => {
    // 1. O Mercado Pago envia um POST para avisar de atualizações
    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    try {
        const { type, data, action } = req.body;
        
        // Verifica se é uma notificação de pagamento (o MP tem formatos diferentes dependendo da configuração)
        const isPayment = (type === "payment" || action?.startsWith("payment"));
        const paymentId = data?.id;

        if (isPayment && paymentId) {
            // Usa a sua mesma chave de teste para ler os dados do pagamento
            const client = new MercadoPagoConfig({ accessToken: 'TEST-1703928170803920-022522-76e65d6dea70c0339d6baa69736a623d-230652618' });
            const payment = new Payment(client);
            
            // Pergunta ao MP: "Quais são os detalhes deste pagamento que você acabou de me avisar?"
            const paymentInfo = await payment.get({ id: paymentId });
            
            // 2. Se o pagamento estiver APROVADO, atualizamos o banco de dados
            if (paymentInfo.status === "approved") {
                const orderId = paymentInfo.external_reference; // É aqui que volta o ID do nosso pedido!
                
                if (orderId) {
                    const db = getFirestore();
                    await db.collection('orders').doc(orderId).update({
                        status: 'paid', // 🟢 Muda o status para pago!
                        paymentId: paymentInfo.id,
                        paidAt: Timestamp.now()
                    });
                    logger.info(`✅ Pedido ${orderId} aprovado e atualizado com sucesso!`);
                }
            }
        }
        
        // 3. Regra de ouro dos Webhooks: Sempre responder com 200 OK rapidamente para o MP não achar que o seu servidor caiu
        res.status(200).send("OK");

    } catch (error) {
        logger.error("Erro no webhook:", error.message);
        res.status(500).send("Erro interno");
    }
});