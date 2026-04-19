const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const axios = require('axios');
const { MercadoPagoConfig, Payment } = require('mercadopago');

initializeApp();

// --- FUNÇÃO DE CRIAR PEDIDO (CHECKOUT TRANSPARENTE) ---
exports.createorder = onCall({ region: "southamerica-east1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Precisa estar autenticado.');
    const userId = request.auth.uid;
    
    // Agora recebemos também o objeto de 'payment' enviado pelo frontend
    const { items, customer, shipping, cupom, payment } = request.data;
    
    if (!items || items.length === 0) throw new HttpsError('invalid-argument', 'Carrinho vazio.');
    if (!payment || !payment.token) throw new HttpsError('invalid-argument', 'Dados de pagamento ausentes.');

    const db = getFirestore();
    let subtotalAmount = 0;

    try {
        const result = await db.runTransaction(async (transaction) => {
            
            // 1. Leituras e Validações de Estoque
            const productRefs = items.map(item => db.collection('products').doc(item.id));
            const productDocs = await transaction.getAll(...productRefs);
            
            let cupomDoc = null;
            let cupomRef = null;
            
            if (cupom && cupom.codigo) {
                cupomRef = db.collection('coupons').doc(cupom.codigo);
                cupomDoc = await transaction.get(cupomRef);
            }

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
                itemsForOrder.push({ id: productDoc.id, name: productData.name, price: productData.price, qty: requestedQty });
                stockUpdates.push({ ref: productDoc.ref, newStock: productData.stock - requestedQty });
            }

            const freteCusto = shipping && shipping.cost ? shipping.cost : 0;
            let valorDesconto = 0;
            let cupomValidoParaUso = false;

            if (cupomDoc && cupomDoc.exists) {
                const cupomData = cupomDoc.data();
                if (cupomData.ativo && cupomData.usado < cupomData.limiteUso && subtotalAmount >= cupomData.valorMinimo) {
                    valorDesconto = cupom.desconto; 
                    cupomValidoParaUso = true;
                }
            }

            const valorTotalFinal = (subtotalAmount - valorDesconto) + freteCusto;
            const orderRef = db.collection('orders').doc();

            // 2. Processamento do Cartão no Mercado Pago
            const client = new MercadoPagoConfig({ accessToken: 'TEST-1703928170803920-022522-76e65d6dea70c0339d6baa69736a623d-230652618' }); // Mantém a sua chave
            const mpPayment = new Payment(client);

            // MONTA O PACOTE DE FORMA INTELIGENTE (Sem campos vazios)
            const paymentBody = {
                transaction_amount: Number(valorTotalFinal.toFixed(2)),
                token: payment.token,
                description: 'Compra na Olomi',
                installments: Number(payment.installments || 1),
                payment_method_id: payment.payment_method_id,
                payer: {
                    // Usa estritamente o e-mail validado pelo Brick
                    email: payment.payer?.email || customer.email
                },
                external_reference: orderRef.id
            };

            // Só adiciona o CPF/CNPJ se ele realmente veio preenchido do formulário
            if (payment.payer?.identification && payment.payer.identification.number) {
                paymentBody.payer.identification = payment.payer.identification;
            }

            // A PROTEÇÃO PRINCIPAL: Só manda o emissor do cartão se ele existir!
            if (payment.issuer_id && payment.issuer_id !== "" && payment.issuer_id !== null) {
                paymentBody.issuer_id = payment.issuer_id;
            }

            let mpResponse;
            try {
                mpResponse = await mpPayment.create({
                    body: paymentBody,
                    requestOptions: { idempotencyKey: orderRef.id } 
                });
            } catch (mpError) {
                // 1. Imprime exatamente o que tentámos enviar
                console.error("📦 PACOTE ENVIADO AO MP:", JSON.stringify(paymentBody, null, 2));
                
                // 2. Extrai o erro profundo (se existir)
                let detalhesErro = mpError.message;
                if (mpError.cause && mpError.cause.length > 0) {
                    detalhesErro = JSON.stringify(mpError.cause);
                }
                
                console.error("❌ MOTIVO REAL DA RECUSA:", detalhesErro);
                
                // 3. Atira o erro real para a tela do site (SweetAlert)
                throw new HttpsError('aborted', `O Mercado Pago bloqueou por este motivo: ${detalhesErro}`);
            }

            // 3. Atualização Definitiva no Banco (Escritas)
            stockUpdates.forEach(update => transaction.update(update.ref, { stock: update.newStock }));
            
            if (cupomValidoParaUso) {
                transaction.update(cupomRef, { usado: cupomDoc.data().usado + 1 });
            }

            transaction.set(orderRef, { 
                userId, 
                items: itemsForOrder, 
                subtotal: subtotalAmount,
                desconto: valorDesconto, 
                cupomUsado: cupomValidoParaUso ? cupom.codigo : null,
                shipping: shipping || { method: 'Nenhum', cost: 0 },
                total: valorTotalFinal,
                customer: customer || {},
                status: mpResponse.status === 'approved' ? 'paid' : 'pending',
                paymentId: mpResponse.id,
                createdAt: Timestamp.now() 
            });
            
            return { status: 'success', orderId: orderRef.id };
        }); 
        return result;
    } catch (error) {
        console.error("ERRO CAPTURADO NO BACKEND:", error);
        
        // Se for um erro que NÓS criamos (ex: 'aborted' de cartão recusado), 
        // repassa para o frontend exatamente como está, sem virar erro 500!
        if (error.code) {
            throw new HttpsError(error.code, error.message);
        }
        
        // Se for um erro do sistema, aí sim vira 'internal'
        throw new HttpsError('internal', error.message || 'Erro interno do servidor.');
    }
});

// Mantém as outras funções inalteradas...
exports.calcularfrete = onCall({ region: "southamerica-east1" }, async (request) => {
    const { cepDestino, items } = request.data;
    if (!cepDestino || !items || items.length === 0) throw new HttpsError('invalid-argument', 'CEP e itens são obrigatórios.');

    let pesoTotal = 0; let alturaTotal = 0; let maiorLargura = 0; let maiorComprimento = 0; let valorTotalCarrinho = 0; 

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
        package: { weight: Math.max(0.1, pesoTotal), height: Math.max(2, alturaTotal), width: Math.max(11, maiorLargura), length: Math.max(16, maiorComprimento) }
    };
    
    try {
        const SUPERFRETE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzM1MDM0OTEsInN1YiI6IkxFczJNa0kyUENhVVZOZnhhRjhma2FDQ0gyQjMifQ.WeF19JgJWGIHKHdQzN9NVlQ-dp4KQjFHkLY_diHz6IM';
        const response = await axios.post('https://api.superfrete.com/api/v0/calculator', payloadSuperFrete, { headers: { 'Authorization': `Bearer ${SUPERFRETE_TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }});
        return response.data;
    } catch (error) {
        throw new HttpsError('internal', 'Falha ao conectar com a transportadora. Tente novamente.');
    }
});

exports.webhookpagamento = onRequest(async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Método não permitido");

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
                    await db.collection('orders').doc(orderId).update({ status: 'paid', paymentId: paymentInfo.id, paidAt: Timestamp.now() });
                }
            }
        }
        res.status(200).send("OK");
    } catch (error) {
        res.status(500).send("Erro interno");
    }
});

exports.validarcupom = onCall({ region: "southamerica-east1" }, async (request) => {
    const { codigo, subtotal } = request.data;
    if (!codigo) throw new HttpsError('invalid-argument', 'Código não informado.');

    const db = getFirestore();
    const cupomSnap = await db.collection('coupons').doc(codigo.toUpperCase()).get();

    if (!cupomSnap.exists) throw new HttpsError('not-found', 'Cupom inválido ou inexistente.');
    const cupom = cupomSnap.data();

    if (cupom.ativo === false) throw new HttpsError('failed-precondition', 'Este cupom está desativado.');
    if (cupom.usado >= cupom.limiteUso) throw new HttpsError('failed-precondition', 'Este cupom já atingiu o limite de usos.');
    if (subtotal < cupom.valorMinimo) throw new HttpsError('failed-precondition', `O valor mínimo para usar este cupom é R$ ${cupom.valorMinimo.toFixed(2)}.`);
    
    let valorDesconto = cupom.tipo === 'fixo' ? parseFloat(cupom.valor) : subtotal * (parseFloat(cupom.valor) / 100);
    return { codigo: cupomSnap.id, desconto: valorDesconto, tipo: cupom.tipo };
});