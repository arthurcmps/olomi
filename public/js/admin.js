import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { collection, getDoc, doc, addDoc, onSnapshot, updateDoc, deleteDoc, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { getStorage, ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";
import { BRL, showToast, showConfirmation } from './utils.js';

// --- Seletores de DOM (Versão Simplificada e Final) ---
const storage = getStorage();
const productForm = document.getElementById('product-form');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const productsTableBody = document.querySelector('#products-table tbody');
const ordersTableBody = document.querySelector('#orders-table tbody');
const logoutButton = document.getElementById('logout');

let currentEditingProductId = null;
let existingImageUrls = [];

// --- Autenticação e Verificação de Permissões ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const roleRef = doc(db, 'roles', user.uid);
        const roleSnap = await getDoc(roleRef);
        if (!roleSnap.exists() || !roleSnap.data().admin) {
            showToast('Acesso negado. Apenas administradores.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
        } else {
            loadProducts();
            loadOrders();
        }
    } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        showToast('Erro ao verificar permissões.', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
});

// --- Funções Principais ---
const loadProducts = () => {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, orderBy("name"));
    onSnapshot(q, (snapshot) => {
        productsTableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const product = docSnap.data();
            const tr = document.createElement('tr');
            // ✅ CORREÇÃO: Substituídos os botões de texto por ícones SVG
            tr.innerHTML = `
                <td><img src="${product.imageUrls[0] || 'https://placehold.co/100x100/f39c12/fff?text=Olomi'}" alt="${product.name}" width="50"></td>
                <td>${product.name}</td>
                <td>${BRL(product.price)}</td>
                <td>${product.stock}</td>
                <td class="actions-cell">
                    <button class="action-btn-icon edit" data-id="${docSnap.id}" title="Editar produto">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </button>
                    <button class="action-btn-icon delete" data-id="${docSnap.id}" title="Apagar produto">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </td>
            `;
            productsTableBody.appendChild(tr);
        });
    });
};

const loadOrders = () => {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        ordersTableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const order = docSnap.data();
            const orderId = docSnap.id;

            const tr = document.createElement('tr');
            tr.className = 'order-summary-row';
            tr.dataset.orderId = orderId;

            const orderDate = order.createdAt?.toDate().toLocaleDateString('pt-BR') || 'Pendente';
            const statusMap = {
                pending: { text: 'Pendente', class: 'pending' },
                shipped: { text: 'Enviado', class: 'shipped' },
                cancelled: { text: 'Cancelado', class: 'cancelled' }
            };
            const statusInfo = statusMap[order.status] || statusMap.pending;

            tr.innerHTML = `
                <td>${orderId.substring(0, 6)}...</td>
                <td>${order.customer?.name || 'N/A'}</td>
                <td>${orderDate}</td>
                <td>${BRL(order.total)}</td>
                <td><span class="status ${statusInfo.class}">${statusInfo.text}</span></td>
                <td class="order-actions">
                    ${order.status === 'pending' ?
                    `<button class="action-btn ship" data-id="${orderId}">Marcar Enviado</button>
                     <button class="action-btn cancel" data-id="${orderId}">Cancelar</button>` : ''
                    }
                </td>
            `;

            const detailsTr = document.createElement('tr');
            detailsTr.className = 'order-details-row';
            detailsTr.style.display = 'none';

            const itemsHtml = order.items.map(item => `<li>${item.qty}x ${item.name} (${BRL(item.price)})</li>`).join('');
            const fullAddress = order.customer?.fullAddress || 'Endereço não fornecido';

            detailsTr.innerHTML = `
                <td colspan="6">
                    <div class="order-details-content">
                        <p><strong>ID do Pedido:</strong> ${orderId}</p>
                        <p><strong>Data e Hora:</strong> ${order.createdAt?.toDate().toLocaleString('pt-BR')}</p>
                        <p><strong>Cliente:</strong> ${order.customer?.name} (${order.customer?.email})</p>
                        <p><strong>Contato:</strong> ${order.customer?.phone}</p>
                        <p><strong>Endereço de Entrega:</strong> ${fullAddress}</p>
                        <div><strong>Itens do Pedido:</strong><ul>${itemsHtml}</ul></div>
                    </div>
                </td>
            `;

            ordersTableBody.appendChild(tr);
            ordersTableBody.appendChild(detailsTr);
        });
    });
};

// --- Listeners de Eventos ---
logoutButton.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = 'login.html');
});

imageUpload.addEventListener('change', (e) => {
    imagePreviewContainer.innerHTML = '';
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = document.createElement('img');
            img.src = event.target.result;
            imagePreviewContainer.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

ordersTableBody.addEventListener('click', async (e) => {
    const actionButton = e.target.closest('.action-btn');
    const summaryRow = e.target.closest('.order-summary-row');

    if (actionButton) {
        e.stopPropagation();
        const id = actionButton.getAttribute('data-id');
        const orderRef = doc(db, 'orders', id);

        if (actionButton.classList.contains('ship')) {
            const confirmed = await showConfirmation('Marcar como Enviado?', 'O estado do pedido será alterado para "Enviado".', 'Sim, enviar');
            if (confirmed) {
                await updateDoc(orderRef, { status: 'shipped' });
                showToast('Pedido marcado como enviado!', 'success');
            }
        } else if (actionButton.classList.contains('cancel')) {
            const confirmed = await showConfirmation('Cancelar este Pedido?', 'Esta ação não pode ser revertida.', 'Sim, cancelar');
            if (confirmed) {
                await updateDoc(orderRef, { status: 'cancelled' });
                showToast('Pedido cancelado.', 'info');
            }
        }
    } else if (summaryRow) {
        const detailsRow = summaryRow.nextElementSibling;
        if (detailsRow?.classList.contains('order-details-row')) {
            detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
        }
    }
});

productsTableBody.addEventListener('click', async (e) => {
    const target = e.target.closest('.action-btn-icon'); // Target icon buttons
    if (!target) return;

    const id = target.getAttribute('data-id');

    if (target.classList.contains('delete')) {
        const confirmed = await showConfirmation('Tem a certeza?', 'O produto será apagado permanentemente.', 'Sim, apagar');
        if (confirmed) {
            try {
                const productRef = doc(db, 'products', id);
                const productSnap = await getDoc(productRef);
                if(productSnap.exists()) {
                    const productData = productSnap.data();
                    if (productData.imageUrls && productData.imageUrls.length > 0) {
                        for (const url of productData.imageUrls) {
                            await deleteObject(ref(storage, url)).catch(err => console.warn("Falha ao apagar imagem antiga:", err));
                        }
                    }
                }
                await deleteDoc(productRef);
                showToast('Produto apagado com sucesso!');
            } catch (error) {
                console.error('Erro ao apagar produto:', error);
                showToast('Falha ao apagar o produto.', 'error');
            }
        }
    }

    if (target.classList.contains('edit')) {
        const productRef = doc(db, 'products', id);
        const productSnap = await getDoc(productRef);
        const product = productSnap.data();

        productForm.name.value = product.name;
        productForm.description.value = product.description;
        productForm.price.value = product.price;
        productForm.stock.value = product.stock;
        productForm.category.value = product.category;

        imagePreviewContainer.innerHTML = '';
        if (product.imageUrls && product.imageUrls.length > 0) {
            product.imageUrls.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                imagePreviewContainer.appendChild(img);
            });
        }

        currentEditingProductId = id;
        existingImageUrls = product.imageUrls || [];
        productForm.querySelector('button[type="submit"]').textContent = 'Atualizar Produto';
        window.scrollTo(0, 0);
    }
});

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = productForm.querySelector('button[type="submit"]');
    const isEditing = !!currentEditingProductId;

    submitButton.disabled = true;
    submitButton.textContent = isEditing ? 'A atualizar...' : 'A guardar...';

    try {
        let imageUrls = existingImageUrls;
        const files = imageUpload.files;

        if (files.length > 0) {
            const formData = new FormData();
            for (const file of files) {
                formData.append('files', file);
            }

            const uploadUrl = 'https://us-central1-olomi-7816a.cloudfunctions.net/uploadFile';
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(errorBody.error || 'Falha no upload do arquivo.');
            }

            const result = await response.json();
            imageUrls = result.imageUrls;

            if (isEditing && existingImageUrls.length > 0) {
                 for (const url of existingImageUrls) {
                    await deleteObject(ref(storage, url)).catch(err => console.warn("Falha ao apagar imagem antiga:", err));
                }
            }
        }

        const productData = {
            name: productForm.name.value,
            description: productForm.description.value,
            price: parseFloat(productForm.price.value),
            stock: parseInt(productForm.stock.value),
            category: productForm.category.value,
            imageUrls: imageUrls
        };

        if (isEditing) {
            await updateDoc(doc(db, 'products', currentEditingProductId), productData);
            showToast('Produto atualizado com sucesso!');
        } else {
            await addDoc(collection(db, 'products'), { ...productData, createdAt: new Date() });
            showToast('Produto adicionado com sucesso!');
        }

        productForm.reset();
        imagePreviewContainer.innerHTML = '';
        currentEditingProductId = null;
        existingImageUrls = [];

    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast(`Falha ao salvar produto: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Salvar Produto';
        imageUpload.value = '';
    }
});
