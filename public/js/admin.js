import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { collection, getDoc, doc, addDoc, onSnapshot, updateDoc, deleteDoc, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { BRL, showToast, showConfirmation } from './utils.js';
import { getStorage, ref, deleteObject, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";

// --- Motor de Compressão de Imagens ---
const compressImage = async (file, maxWidth = 800, quality = 0.8) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scaleSize = maxWidth / img.width;
                const scale = scaleSize < 1 ? scaleSize : 1; 
                
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("O navegador não suporta a conversão para WebP."));
                    }
                }, 'image/webp', quality);
            };
            img.onerror = () => reject(new Error("Erro ao carregar a imagem para compressão."));
        };
        reader.onerror = () => reject(new Error("Erro ao ler o ficheiro original."));
    });
};

const storage = getStorage();
const productForm = document.getElementById('product-form');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const productsTableBody = document.querySelector('#products-table tbody');
const ordersTableBody = document.querySelector('#orders-table tbody');

let currentEditingProductId = null;
let existingImageUrls = [];

// --- Autenticação ---
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
            loadThemeSettings(); // Agora a função existe e será chamada corretamente!
        }
    } catch (error) {
        console.error('Erro ao verificar permissões:', error);
        showToast('Erro ao verificar permissões.', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
});

// --- Carregar Produtos ---
const loadProducts = () => {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, orderBy("name"));
    onSnapshot(q, (snapshot) => {
        productsTableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const product = docSnap.data();
            const tr = document.createElement('tr');
            
            // Lógica para sinalizar a promoção na tabela
            const isPromo = product.promotionalPrice && product.promotionalPrice > 0;
            const nomeComBadge = isPromo 
                ? `${product.name} <br><span style="background-color: #e74c3c; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; display: inline-block; margin-top: 5px;">🔥 Promoção Ativa</span>` 
                : product.name;
            
            const precoFormatado = isPromo 
                ? `<span style="text-decoration: line-through; color: #999; font-size: 0.85em;">${BRL(product.price)}</span> <br> <strong>${BRL(product.promotionalPrice)}</strong>` 
                : BRL(product.price);

            tr.innerHTML = `
                <td><img src="${product.imageUrls[0] || 'https://placehold.co/100x100/f39c12/fff?text=Olomi'}" alt="${product.name}" width="50"></td>
                <td>${nomeComBadge}</td>
                <td>${precoFormatado}</td>
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

// --- Carregar Pedidos ---
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
                paid: { text: 'Pago', class: 'paid' },
                shipped: { text: 'Enviado', class: 'shipped' },
                cancelled: { text: 'Cancelado', class: 'cancelled' }
            };
            const statusInfo = statusMap[order.status] || statusMap.pending;

            const customer = order.customer || {};
            const address = customer.address || {};
            const shipping = order.shipping || { method: 'Nenhum', cost: 0 };

            const formattedAddress = address.street 
                ? `${address.street}, ${address.number} ${address.complement ? '- ' + address.complement : ''}<br>${address.neighborhood}, ${address.city} - ${address.state}<br>CEP: ${address.cep}` 
                : (order.customer?.fullAddress || 'Endereço não fornecido');

            tr.innerHTML = `
                <td><strong>#${orderId.substring(0, 6)}</strong></td>
                <td>
                    <strong>${customer.name || 'Cliente (Sem Nome)'}</strong><br>
                    <small>📱 ${customer.phone || 'Sem telefone'}</small>
                </td>
                <td>${orderDate}</td>
                <td>
                    <strong>${BRL(order.total)}</strong><br>
                    <small style="color: #666;">Frete: ${shipping.method} (${BRL(shipping.cost)})</small>
                </td>
                <td><span class="status ${statusInfo.class}">${statusInfo.text}</span></td>
                <td class="order-actions">
                    ${(order.status === 'pending' || order.status === 'paid') ?
                    `<button class="action-btn ship" data-id="${orderId}">Marcar Enviado</button>
                     <button class="action-btn cancel" data-id="${orderId}">Cancelar</button>` : ''
                    }
                </td>
            `;

            const detailsTr = document.createElement('tr');
            detailsTr.className = 'order-details-row';
            detailsTr.style.display = 'none';

            const itemsHtml = order.items.map(item => `<li>${item.qty}x ${item.name} (${BRL(item.price)})</li>`).join('');

            detailsTr.innerHTML = `
                <td colspan="6">
                    <div class="order-details-content" style="display: flex; gap: 2rem; text-align: left; padding: 1rem; background-color: #f9f9f9; border-radius: 8px;">
                        <div style="flex: 1;">
                            <p><strong>ID do Pedido:</strong> ${orderId}</p>
                            <p><strong>Data e Hora:</strong> ${order.createdAt?.toDate().toLocaleString('pt-BR')}</p>
                            <p><strong>Email:</strong> ${customer.email || 'Não informado'}</p>
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ddd;">
                                <strong>Endereço de Entrega:</strong><br>
                                <span style="color: var(--cor-secundaria);">${formattedAddress}</span>
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <strong>Itens do Pedido:</strong>
                            <ul style="margin-top: 0.5rem; padding-left: 1.2rem;">${itemsHtml}</ul>
                            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ddd;">
                                <p><strong>Subtotal:</strong> ${BRL(order.subtotal || 0)}</p>
                                <p><strong>Frete (${shipping.method}):</strong> ${BRL(shipping.cost)}</p>
                                <p style="font-size: 1.1rem; color: var(--cor-laranja);"><strong>Total: ${BRL(order.total)}</strong></p>
                            </div>
                        </div>
                    </div>
                </td>
            `;

            ordersTableBody.appendChild(tr);
            ordersTableBody.appendChild(detailsTr);
        });
    });
};

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
    const target = e.target.closest('.action-btn-icon');
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
                if (currentEditingProductId === id) {
                    productForm.reset();
                    imagePreviewContainer.innerHTML = '';
                    currentEditingProductId = null;
                    productForm.querySelector('button[type="submit"]').textContent = 'Salvar Produto';
                }
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
        productForm.promoPrice.value = product.promotionalPrice || '';
        productForm.stock.value = product.stock;
        productForm.category.value = product.category;
        productForm.weight.value = product.weight || '';
        productForm.length.value = product.length || '';
        productForm.width.value = product.width || '';
        productForm.height.value = product.height || '';

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
    submitButton.textContent = isEditing ? 'Atualizando...' : 'Salvando...';

    try {
        let imageUrls = existingImageUrls;
        const files = imageUpload.files;

        if (files.length > 0) {
            const novasImagens = [];
            
            for (const file of Array.from(files)) {
                const compressedBlob = await compressImage(file, 800, 0.8);
                const novoNome = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                const fileRef = ref(storage, `products/${Date.now()}_${novoNome}`);
                
                const metadata = { contentType: 'image/webp' };
                const snapshot = await uploadBytes(fileRef, compressedBlob, metadata);                
                
                const downloadURL = await getDownloadURL(snapshot.ref);
                novasImagens.push(downloadURL);
            }
            
            imageUrls = novasImagens;

            if (isEditing && existingImageUrls.length > 0) {
                 for (const url of existingImageUrls) {
                    await deleteObject(ref(storage, url)).catch(err => console.warn("Aviso ao apagar imagem antiga:", err));
                }
            }
        }

        const precoFormatado = productForm.price.value.replace(',', '.');

        const productData = {
            name: productForm.name.value,
            description: productForm.description.value,
            price: parseFloat(precoFormatado),
            promotionalPrice: parseFloat(productForm.promoPrice.value) || null,
            stock: parseInt(productForm.stock.value),
            category: productForm.category.value,
            weight: parseFloat(productForm.weight.value) || 0,
            length: parseInt(productForm.length.value) || 0,
            width: parseInt(productForm.width.value) || 0,
            height: parseInt(productForm.height.value) || 0,
            imageUrls: imageUrls
        };

        if (isEditing) {
            await updateDoc(doc(db, 'products', currentEditingProductId), productData);
            showToast('Produto atualizado com sucesso!', 'success');
        } else {
            await addDoc(collection(db, 'products'), { ...productData, createdAt: new Date() });
            showToast('Produto adicionado com sucesso!', 'success');
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

// ==========================================
// MOTOR DE TEMAS E LOGO (Aparência da Loja)
// ==========================================
const themeForm = document.getElementById('theme-form');
const logoContainer = document.getElementById('logo-edit-container');
const logoInput = document.getElementById('logoUpload');
const currentLogoImg = document.getElementById('current-logo-img');

let selectedLogoFile = null;

// 1. Carregar o tema e a logo (Usando async function para evitar erro de Hoisting)
async function loadThemeSettings() {
    try {
        const themeRef = doc(db, 'settings', 'storeTheme');
        const themeSnap = await getDoc(themeRef);
        
        if (themeSnap.exists()) {
            const data = themeSnap.data();
            if(data.primaryColor && themeForm) themeForm.themeColor.value = data.primaryColor;
            if(data.topBarMessage && themeForm) themeForm.topBarText.value = data.topBarMessage;
            if(data.logoUrl && currentLogoImg) currentLogoImg.src = data.logoUrl;
        }
    } catch (error) {
        console.error("Erro ao carregar tema:", error);
    }
}

// 2. PRÉ-VISUALIZAÇÃO DA LOGO (Não faz upload, apenas mostra na tela)
if (logoContainer && logoInput) {
    logoContainer.addEventListener('click', () => logoInput.click());

    logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        selectedLogoFile = file;

        const reader = new FileReader();
        reader.onload = (event) => {
            if(currentLogoImg) currentLogoImg.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 3. SALVAR TUDO (Cores, Textos e fazer o Upload da Logo se houver)
if (themeForm) {
    const btnSubmit = themeForm.querySelector('button');
    if (btnSubmit) btnSubmit.textContent = 'Salvar Tema da Loja';

    themeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = themeForm.querySelector('button');
        btn.textContent = 'Salvando...';
        btn.disabled = true;

        try {
            let finalLogoUrl = null;

            if (selectedLogoFile) {
                showToast('Fazendo upload da nova logo...', 'info');
                const fileRef = ref(storage, `settings/logo_${Date.now()}_${selectedLogoFile.name}`);
                const snapshot = await uploadBytes(fileRef, selectedLogoFile);
                finalLogoUrl = await getDownloadURL(snapshot.ref);
            }

            const themeRef = doc(db, 'settings', 'storeTheme');
            const themeData = {
                primaryColor: themeForm.themeColor.value,
                topBarMessage: themeForm.topBarText.value,
                updatedAt: new Date()
            };

            if (finalLogoUrl) {
                themeData.logoUrl = finalLogoUrl;
            }

            await updateDoc(themeRef, themeData).catch(async (err) => {
                if(err.code === 'not-found') {
                    const { setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js');
                    await setDoc(themeRef, themeData);
                } else throw err;
            });

            showToast('Tema atualizado com sucesso!', 'success');

            if (finalLogoUrl) {
                document.querySelectorAll('.logo, .login-logo').forEach(img => img.src = finalLogoUrl);
                selectedLogoFile = null; 
            }

        } catch (error) {
            console.error("Erro ao salvar tema:", error);
            showToast('Erro ao atualizar tema.', 'error');
        } finally {
            btn.textContent = 'Salvar Tema da Loja';
            btn.disabled = false;
        }
    });
}