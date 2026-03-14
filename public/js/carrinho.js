import { db, auth, functions } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-functions.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { BRL, cartStore, showToast } from './utils.js';

const itemsListEl = document.getElementById('cart-items-list');
const totalsEl = document.getElementById('totals-summary');
const form = document.getElementById('checkout-form');
const cartContainer = document.getElementById('cart-container');
const btnCalcShipping = document.getElementById('btn-calc-shipping');
const inputCep = document.getElementById('calc-cep');
const shippingResult = document.getElementById('shipping-result');

// Variáveis globais para armazenar a escolha do cliente (adicione no topo do arquivo se preferir)
window.valorFrete = 0;
window.nomeFrete = '';

if (btnCalcShipping) {
    btnCalcShipping.addEventListener('click', async () => {
        const cep = inputCep.value.replace(/\D/g, '');
        
        if (cep.length !== 8) {
            shippingResult.innerHTML = '<span style="color: #e74c3c;">Digite um CEP válido com 8 dígitos.</span>';
            return;
        }

        shippingResult.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0 auto;"></div> Buscando opções nos Correios...';
        btnCalcShipping.disabled = true;

        const cart = cartStore.get();
        const itemsForFreight = cart.map(item => ({
            qty: item.qty,
            weight: item.weight || 0.5, // Garante um peso mínimo
            length: item.length || 20,
            width: item.width || 20,
            height: item.height || 20
        }));

        const functionsBR = getFunctions(functions.app, 'southamerica-east1');
        const calcularFreteFunction = httpsCallable(functionsBR, 'calcularfrete');
        
        try {
            const result = await calcularFreteFunction({ cepDestino: cep, items: itemsForFreight });
            
            // A API do SuperFrete retorna a lista completa aqui
            const todasOpcoes = result.data;

            // --- O FILTRO MÁGICO ---
            // Ignora Jadlog, Loggi, etc., e pega apenas o que for da empresa "Correios"
            const apenasCorreios = todasOpcoes.filter(opcao => 
                opcao.company && opcao.company.name.toUpperCase() === 'CORREIOS'
            );

            let htmlOpcoes = '<div style="margin-top: 1rem; text-align: left; display: flex; flex-direction: column; gap: 0.5rem;">';
            
            if (apenasCorreios.length > 0) {
                apenasCorreios.forEach(opcao => {
                    // O SuperFrete já manda o nome ("PAC" ou "SEDEX") e o preço
                    const tipo = opcao.name; 
                    const valorNumerico = parseFloat(opcao.price);
                    
                    htmlOpcoes += `
                        <label style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;">
                            <div>
                                <input type="radio" name="escolhaFrete" value="${valorNumerico}" data-nome="${tipo}" onchange="selecionarFrete(this)">
                                <strong>${tipo}</strong> (até ${opcao.delivery_time} dias úteis)
                            </div>
                            <span>${BRL(valorNumerico)}</span>
                        </label>
                    `;
                });
                htmlOpcoes += '</div>';
                shippingResult.innerHTML = htmlOpcoes;
            } else {
                // Se a API não devolver opções dos Correios para este CEP
                shippingResult.innerHTML = `<div style="color: #e74c3c; margin-top: 1rem; padding: 1rem; border: 1px solid #ffcccc; border-radius: 8px; background-color: #fff9f9;">
                    <strong style="display:block;">Indisponível no momento.</strong>
                    Não foi possível calcular o frete dos Correios para este CEP. Verifique se o CEP está correto.
                </div>`;
            }

        } catch (error) {
            console.error("Erro do frete:", error);
            shippingResult.innerHTML = `<span style="color: #e74c3c; display: block; margin-top: 1rem;">Erro ao consultar os Correios: Tente novamente.</span>`;
        } finally {
            btnCalcShipping.disabled = false;
        }
    });
}

// Função global para atualizar o total quando o cliente clica na bolinha do rádio
window.selecionarFrete = function(radioElement) {
    window.valorFrete = parseFloat(radioElement.value);
    window.nomeFrete = radioElement.getAttribute('data-nome');
    renderCart(); // Atualiza a tela com o novo total
};

// Resetar o frete se alterar os itens do carrinho
cartStore.onChange(() => {
    window.valorFrete = 0;
    window.nomeFrete = '';
    if (shippingResult) shippingResult.innerHTML = '';
    renderCart();
});

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

    // --- AQUI ESTÁ A CORREÇÃO PRINCIPAL ---
    if (totalsEl) {
        const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
        
        // Adiciona o frete ao total
        const total = subtotal + (window.valorFrete || 0);
        
        // Só cria a linha do frete se houver algum valor selecionado
        let linhaFrete = '';
        if (window.valorFrete > 0) {
            linhaFrete = `<div class="summary-row"><span style="color: var(--cor-laranja);">Frete (${window.nomeFrete})</span><span>${BRL(window.valorFrete)}</span></div>`;
        }

        totalsEl.innerHTML = `
            <div class="summary-row"><span>Subtotal</span><span>${BRL(subtotal)}</span></div>
            ${linhaFrete}
            <div class="summary-row total"><span>Total</span><span>${BRL(total)}</span></div>
        `;
    }
    // --------------------------------------
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
    // --- CORREÇÃO EXTRA: Garante que a mensagem no WhatsApp inclui o frete ---
    if (window.valorFrete > 0) {
        lines.push(`Frete (${window.nomeFrete}): ${BRL(window.valorFrete)}`);
        // Adiciona o frete ao total do pedido na mensagem
        lines.push(`*Total:* *${BRL(orderData.total + window.valorFrete)}*`); 
    } else {
        lines.push(`*Total:* *${BRL(orderData.total)}*`);
    }
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

    if (window.valorFrete === 0) {
        showToast('Por favor, calcule e selecione uma opção de frete antes de finalizar.', 'warning');
        inputCep.focus();
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Validando...';

    // 1. CAPTURAR TODOS OS DADOS DO CLIENTE E DO FRETE AQUI
    const formData = Object.fromEntries(new FormData(form).entries());
    const customerPayload = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || user.email,
        address: {
            cep: formData.cep,
            street: formData.street,
            number: formData.number,
            complement: formData.complement,
            neighborhood: formData.neighborhood,
            city: formData.city,
            state: formData.state
        }
    };
    
    const shippingPayload = {
        method: window.nomeFrete,
        cost: window.valorFrete
    };

    const itemsForFunction = cart.map(item => ({ id: item.id, qty: item.qty }));
    
    // Garanta que está a chamar a função na região correta se estiver a usar o servidor BR
    const functionsBR = getFunctions(functions.app, 'southamerica-east1'); 
    const createOrderFunction = httpsCallable(functionsBR, 'createorder');

    try {
        // 2. ENVIAR O PACOTE COMPLETO PARA O BACKEND
        const result = await createOrderFunction({ 
            items: itemsForFunction,
            customer: customerPayload,
            shipping: shippingPayload
        });
        
        const { orderId, orderDetails, checkoutUrl } = result.data;
        submitButton.textContent = 'Redirecionando para o pagamento...';
        
        // Limpa o carrinho e avisa o cliente
        cartStore.clear();
        showToast('Pedido gerado! Redirecionando para o pagamento...', 'success');
        
        // Redireciona para o ambiente de testes do Mercado Pago
        setTimeout(() => {
            window.location.href = checkoutUrl;
        }, 1500);

    } catch (error) {
        console.error("Erro ao finalizar pedido:", error);
        showToast(error.message || 'Ocorreu um erro desconhecido.', 'error');
        submitButton.disabled = false;
        submitButton.textContent = 'Finalizar Compra';
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