import { db, auth, functions } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { BRL, cartStore, showToast } from './utils.js';

const itemsListEl = document.getElementById('cart-items-list');
const totalsEl = document.getElementById('totals-summary');
const form = document.getElementById('checkout-form');
const cartContainer = document.getElementById('cart-container');

// Preenche o formulário com os dados do utilizador autenticado
async function populateFormWithUserData(user) {
    if (!user || !form) return;
    const userRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        const userData = docSnap.data();
        form.name.value = userData.name || '';
        form.phone.value = userData.phone || '';
        form.email.value = user.email || '';
        if (userData.address) {
            form.cep.value = userData.address.cep || '';
            form.street.value = userData.address.street || '';
            form.number.value = userData.address.number || '';
            form.complement.value = userData.address.complement || '';
            form.neighborhood.value = userData.address.neighborhood || '';
            form.city.value = userData.address.city || '';
            form.state.value = userData.address.state || '';
        }
    }
}

// Renderiza os itens do carrinho e os totais
function renderCart() {
    const cart = cartStore.get();
    
    if (cart.length === 0) {
        if (cartContainer) {
            cartContainer.innerHTML = `
                <div class="cart-empty">
                    <h2>O seu carrinho está vazio.</h2>
                    <p>Adicione produtos do nosso catálogo para os ver aqui.</p>
                    <a href="index.html" class="back-to-store-btn">Voltar ao Catálogo</a>
                </div>`;
        }
        if (itemsListEl) itemsListEl.innerHTML = '';
        if (totalsEl) totalsEl.innerHTML = '';
        return;
    }

    if (itemsListEl) {
        itemsListEl.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="item-image"><img src="${item.imageUrl || 'https://placehold.co/80x80/f39c12/fff?text=Olomi'}" alt="${item.name}"></div>
                <div class="item-info">
                    <p class="item-name">${item.name}</p>
                    <div class="item-quantity">
                        <button data-id="${item.id}" data-action="decrease">-</button>
                        <span>${item.qty}</span>
                        <button data-id="${item.id}" data-action="increase">+</button>
                    </div>
                </div>
                <div class="item-price">
                    <p>${BRL(item.price * item.qty)}</p>
                    <div class="item-actions"><button class="remove-btn" data-id="${item.id}" data-action="remove">Remover</button></div>
                </div>
            </div>
        `).join('');
    }

    if (totalsEl) {
        const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
        totalsEl.innerHTML = `
            <div class="summary-row"><span>Subtotal</span><span>${BRL(subtotal)}</span></div>
            <div class="summary-row total"><span>Total</span><span>${BRL(subtotal)}</span></div>
        `;
    }
}

// Atualiza a quantidade de um item no carrinho ou remove-o
function updateCart(productId, action) {
    const cart = cartStore.get();
    const itemIndex = cart.findIndex(i => i.id === productId);
    if (itemIndex < 0) return;

    const item = cart[itemIndex];
    if (action === 'increase') {
        if (item.qty < item.stock) {
            item.qty++;
        } else {
            showToast('Quantidade máxima em stock atingida.', 'info');
        }
    } else if (action === 'decrease') {
        item.qty--;
        if (item.qty <= 0) {
            cart.splice(itemIndex, 1);
        }
    } else if (action === 'remove') {
        cart.splice(itemIndex, 1);
    }
    
    cartStore.set(cart); // Salva o carrinho e notifica os listeners (que vão chamar o renderCart)
}

// Constrói a mensagem para o WhatsApp
function buildWhatsappMessage(orderId, orderData, customerData) {
    const lines = [];
    lines.push('🛍️ *Novo Pedido Olomi* 🛍️');
    lines.push(`*Pedido:* ${orderId}`);
    lines.push('--------------------------');
    orderData.items.forEach(it => lines.push(`${it.qty}x ${it.name} – ${BRL(it.price * it.qty)}`));
    lines.push('--------------------------');
    lines.push(`*Total:* *${BRL(orderData.total)}*`);
    lines.push('--------------------------');
    lines.push('*Dados do Cliente:*');
    lines.push(`*Nome:* ${customerData.name}`);
    if (customerData.phone) lines.push(`*WhatsApp:* ${customerData.phone}`);
    lines.push(`*Endereço:* ${customerData.fullAddress}`);
    lines.push('\nObrigado pela preferência! ✨');
    return lines.join('\n');
}

// Listener para os botões de +/-
if (itemsListEl) {
    itemsListEl.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const { id, action } = button.dataset;
        if (id && action) updateCart(id, action);
    });
}

// Listener para o formulário de checkout
form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showToast('Você precisa de estar autenticado para finalizar a compra.', 'warning');
        return window.location.href = `login-cliente.html?redirect=carrinho.html`;
    }

    const cart = cartStore.get();
    if (cart.length === 0) {
        return showToast('O seu carrinho está vazio.', 'info');
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'A validar...';

    const itemsForFunction = cart.map(item => ({ id: item.id, qty: item.qty }));
    const createOrderFunction = httpsCallable(functions, 'createorder');

    try {
        const result = await createOrderFunction({ items: itemsForFunction });
        const { orderId, orderDetails } = result.data;

        submitButton.textContent = 'A redirecionar...';
        
        const formData = Object.fromEntries(new FormData(form).entries());
        const fullAddress = `${formData.street}, ${formData.number}${formData.complement ? ' - ' + formData.complement : ''} - ${formData.neighborhood}, ${formData.city} - ${formData.state}, CEP: ${formData.cep}`;
        
        const customerDataForWpp = { name: formData.name, phone: formData.phone, fullAddress };

        const lojaNumero = '5519987346984'; // Substituir pelo número da loja
        const msg = buildWhatsappMessage(orderId, orderDetails, customerDataForWpp);
        const whatsappUrl = `https://wa.me/${lojaNumero}?text=${encodeURIComponent(msg)}`;

        cartStore.clear();
        showToast('Pedido recebido! A redirecionar para o WhatsApp...', 'success');
        window.open(whatsappUrl, '_blank');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error("Erro ao finalizar pedido:", error);
        showToast(error.message || 'Ocorreu um erro desconhecido.', 'error');
        submitButton.disabled = false;
        submitButton.textContent = 'Finalizar via WhatsApp';
    }
});

// Função de inicialização da página
function init() {
    // --- MELHORIA: Sistema reativo ---
    // 1. Renderiza o estado inicial do carrinho.
    renderCart();
    // 2. Regista a função renderCart para ser chamada sempre que o carrinho mudar.
    cartStore.onChange(renderCart);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            populateFormWithUserData(user);
        }
    });
}

init();
