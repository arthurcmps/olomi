const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const axios = require('axios'); // Vamos usar o axios para consultar APIs
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

initializeApp();

// --- FUNÇÃO DE CRIAR PEDIDO ---
exports.createorder = onCall({ region: "southamerica-east1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Precisa estar autenticado.');
    const userId = request.auth.uid;
    
    // 🔴 CORREÇÃO AQUI: Adicionamos o "cupom" na extração de dados
    const { items, customer, shipping, cupom } = request.data;
    
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
            let valorDesconto = 0;

            // Se o cliente mandou um cupom, vamos checar no banco de dados de novo!
            if (cupom && cupom.codigo) {
                const cupomRef = db.collection('coupons').doc(cupom.codigo);
                const cupomDoc = await transaction.get(cupomRef);
                
                if (cupomDoc.exists) {
                    const cupomData = cupomDoc.data();
                    // Regras de segurança finais:
                    if (cupomData.ativo && cupomData.usado < cupomData.limiteUso && subtotalAmount >= cupomData.valorMinimo) {
                        valorDesconto = cupom.desconto; 
                        // Dá baixa no cupom: soma +1 no número de vezes usado!
                        transaction.update(cupomRef, { usado: cupomData.usado + 1 }); 
                    }
                }
            }

            const valorTotalFinal = (subtotalAmount - valorDesconto) + freteCusto;

            const orderDetails = { 
                items: itemsForOrder, 
                subtotal: subtotalAmount,
                desconto: valorDesconto, // Guarda no pedido o quanto ele ganhou de desconto
                shipping: shipping || { method: 'Nenhum', cost: 0 },
                total: valorTotalFinal, // O valor final abatido
                customer: customer || {} 
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
                            unit_price: Number(valorTotalFinal.toFixed(2))
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
                } 
            }); 

            // Atualiza a base de dados com o link de pagamento
            transaction.update(orderRef, { paymentUrl: mpResponse.sandbox_init_point }); 

            // Retorna o link de pagamento de teste (sandbox) para o site
            return { 
                orderId: orderRef.id, 
                orderDetails, 
                checkoutUrl: mpResponse.sandbox_init_point 
            };
        }); 
        return result;
    } catch (error) {
        throw new HttpsError('internal', error.message || 'Erro ao processar pedido.');
    }
});


// --- NOVA FUNÇÃO DE FRETE (API SUPERFRETE REAL COM SEGURO) ---
exports.calcularfrete = onCall({ region: "southamerica-east1" }, async (request) => {
    const { cepDestino, items } = request.data;

    if (!cepDestino || !items || items.length === 0) {
        throw new HttpsError('invalid-argument', 'CEP e itens são obrigatórios.');
    }

    // 1. CUBAGEM INTELIGENTE E VALOR DECLARADO
    let pesoTotal = 0;
    let alturaTotal = 0;
    let maiorLargura = 0;
    let maiorComprimento = 0;
    let valorTotalCarrinho = 0; 

    items.forEach(item => {
        const qty = item.qty || 1;
        
        pesoTotal += (parseFloat(item.weight) || 0.5) * qty;
        alturaTotal += (parseFloat(item.height) || 15) * qty;
        maiorLargura = Math.max(maiorLargura, (parseFloat(item.width) || 20));
        maiorComprimento = Math.max(maiorComprimento, (parseFloat(item.length) || 20));
        
        valorTotalCarrinho += (parseFloat(item.price) || 0) * qty;
    });

    const payloadSuperFrete = {
        from: { postal_code: "21371270" }, 
        to: { postal_code: cepDestino.replace(/\D/g, '') },
        services: "1,2", 
        declared_value: valorTotalCarrinho, 
        package: {
            weight: Math.max(0.1, pesoTotal),
            height: Math.max(2, alturaTotal),
            width: Math.max(11, maiorLargura),
            length: Math.max(16, maiorComprimento)
        }
    };
    
    try {
        const SUPERFRETE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzM1MDM0OTEsInN1YiI6IkxFczJNa0kyUENhVVZOZnhhRjhma2FDQ0gyQjMifQ.WeF19JgJWGIHKHdQzN9NVlQ-dp4KQjFHkLY_diHz6IM';

        const response = await axios.post(
            'https://api.superfrete.com/api/v0/calculator', 
            payloadSuperFrete,
            {
                headers: {
                    'Authorization': `Bearer ${SUPERFRETE_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }
        );

        return response.data;

    } catch (error) {
        const statusErro = error.response ? error.response.status : 'Sem Status';
        const detalheDoErro = error.response && error.response.data 
            ? JSON.stringify(error.response.data) 
            : error.message;
            
        logger.error(`Erro SuperFrete [${statusErro}]:`, detalheDoErro);
        throw new HttpsError('internal', 'Falha ao conectar com a transportadora. Tente novamente.');
    }
});


// --- WEBHOOK DO MERCADO PAGO ---
exports.webhookpagamento = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    try {
        const { type, data, action } = req.body;
        
        const isPayment = (type === "payment" || action?.startsWith("payment"));
        const paymentId = data?.id;

        if (isPayment && paymentId) {
            const client = new MercadoPagoConfig({ accessToken: 'TEST-1703928170803920-022522-76e65d6dea70c0339d6baa69736a623d-230652618' });
            const payment = new Payment(client);
            
            const paymentInfo = await payment.get({ id: paymentId });
            
            if (paymentInfo.status === "approved") {
                const orderId = paymentInfo.external_reference; 
                
                if (orderId) {
                    const db = getFirestore();
                    await db.collection('orders').doc(orderId).update({
                        status: 'paid', 
                        paymentId: paymentInfo.id,
                        paidAt: Timestamp.now()
                    });
                    logger.info(`✅ Pedido ${orderId} aprovado e atualizado com sucesso!`);
                }
            }
        }
        
        res.status(200).send("OK");

    } catch (error) {
        logger.error("Erro no webhook:", error.message);
        res.status(500).send("Erro interno");
    }
});

// --- NOVA FUNÇÃO: VALIDAÇÃO DE CUPOM DE DESCONTO ---
exports.validarcupom = onCall({ region: "southamerica-east1" }, async (request) => {
    const { codigo, subtotal } = request.data;

    if (!codigo) {
        throw new HttpsError('invalid-argument', 'Código não informado.');
    }

    const db = getFirestore();
    const cupomRef = db.collection('coupons').doc(codigo.toUpperCase());
    const cupomSnap = await cupomRef.get();

    if (!cupomSnap.exists) {
        throw new HttpsError('not-found', 'Cupom inválido ou inexistente.');
    }

    const cupom = cupomSnap.data();

    if (cupom.ativo === false) {
        throw new HttpsError('failed-precondition', 'Este cupom está desativado.');
    }

    if (cupom.usado >= cupom.limiteUso) {
        throw new HttpsError('failed-precondition', 'Este cupom já atingiu o limite de usos.');
    }

    if (subtotal < cupom.valorMinimo) {
        throw new HttpsError('failed-precondition', `O valor mínimo para usar este cupom é R$ ${cupom.valorMinimo.toFixed(2)}.`);
    }

    if (cupom.validade && cupom.validade.toDate() < new Date()) {
        throw new HttpsError('failed-precondition', 'Este cupom já expirou.');
    }

    let valorDesconto = 0;
    if (cupom.tipo === 'fixo') {
        valorDesconto = parseFloat(cupom.valor);
    } else if (cupom.tipo === 'porcentagem') {
        valorDesconto = subtotal * (parseFloat(cupom.valor) / 100);
    }

    return {
        codigo: cupomSnap.id,
        desconto: valorDesconto,
        tipo: cupom.tipo
    };
});