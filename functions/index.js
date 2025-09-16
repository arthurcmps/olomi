
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

// Inicializa o Firebase Admin SDK
initializeApp();

/**
 * Cloud Function "Chamável" para criar um pedido.
 * Executa validações de segurança e de negócio no lado do servidor.
 *
 * @param {object} request - O objeto da requisição, contendo os dados enviados pelo cliente.
 * @returns {Promise<{orderId: string}>} - Retorna o ID do pedido criado.
 */
exports.createorder = onCall(async (request) => {
    // 1. Validação de Autenticação
    // A função "onCall" já garante que `request.auth` existe.
    // Se o utilizador não estiver autenticado, a função lança um erro automaticamente.
    if (!request.auth) {
        logger.error("Tentativa de criação de pedido por utilizador não autenticado.");
        throw new HttpsError('unauthenticated', 'Você precisa estar autenticado para fazer um pedido.');
    }

    const userId = request.auth.uid;
    const items = request.data.items; // Espera-se um array [{ id, qty }, ...]

    // 2. Validação de Input
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new HttpsError('invalid-argument', 'O carrinho está vazio ou os dados do pedido são inválidos.');
    }

    const db = getFirestore();
    let totalAmount = 0; // O total será calculado no servidor

    try {
        // Usamos uma transação para garantir a consistência do stock
        const orderId = await db.runTransaction(async (transaction) => {
            const productRefs = items.map(item => db.collection('products').doc(item.id));
            const productDocs = await transaction.getAll(...productRefs);

            const itemsForOrder = [];
            const stockUpdates = [];

            for (let i = 0; i < productDocs.length; i++) {
                const productDoc = productDocs[i];
                const item = items[i];

                if (!productDoc.exists) {
                    throw new HttpsError('not-found', `Produto com ID ${item.id} não encontrado.`);
                }

                const productData = productDoc.data();
                const requestedQty = Number(item.qty);

                // 3. Validação de Stock e Quantidade
                if (isNaN(requestedQty) || requestedQty <= 0) {
                     throw new HttpsError('invalid-argument', `Quantidade inválida para o produto ${productData.name}.`);
                }
                if (productData.stock < requestedQty) {
                    throw new HttpsError('failed-precondition', `Stock insuficiente para o produto: ${productData.name}.`);
                }

                // 4. Cálculo de Preço no Servidor
                totalAmount += (productData.price * requestedQty);
                
                // Prepara os dados do item para serem guardados no pedido
                itemsForOrder.push({
                    id: productDoc.id,
                    name: productData.name,
                    price: productData.price, // Preço do servidor
                    qty: requestedQty,
                    imageUrl: productData.imageUrls && productData.imageUrls.length > 0 ? productData.imageUrls[0] : null
                });

                // Prepara a atualização do stock
                stockUpdates.push({
                    ref: productDoc.ref,
                    newStock: productData.stock - requestedQty
                });
            }

            // Após validar todos os itens, regista as atualizações de stock
            stockUpdates.forEach(update => {
                transaction.update(update.ref, { stock: update.newStock });
            });

            // 5. Criação do Pedido
            const orderRef = db.collection('orders').doc(); // Cria uma referência com um ID único
            transaction.set(orderRef, {
                userId: userId,
                items: itemsForOrder,
                total: totalAmount,
                status: 'pending', // Status inicial
                createdAt: Timestamp.now()
            });

            return orderRef.id;
        });

        logger.info(`Pedido ${orderId} criado com sucesso para o utilizador ${userId}.`);
        return { orderId: orderId };

    } catch (error) {
        logger.error(`Erro ao criar pedido para o utilizador ${userId}:`, error);

        // Se o erro já for um HttpsError, propaga-o. Caso contrário, lança um erro genérico.
        if (error instanceof HttpsError) {
            throw error;
        } else {
            throw new HttpsError('internal', 'Ocorreu um erro interno ao processar o seu pedido.');
        }
    }
});
