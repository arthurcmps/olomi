import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
// Corrigido: Importa o cartStore e o showToast, o padrão centralizado no projeto.
import { BRL, cartStore, showToast } from './utils.js';

const productDetailEl = document.getElementById('product-detail');

let currentProduct = null; // Guarda o produto carregado nesta página

/**
 * Lida com a lógica de adicionar o produto atual ao carrinho.
 * @param {object} product - O objeto do produto a ser adicionado.
 * @param {HTMLElement} button - O botão que foi clicado, para dar feedback visual.
 */
function handleAddToCart(product, button) {
    if (!product) return;

    const cart = cartStore.get();
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        if (existingItem.qty < product.stock) {
            existingItem.qty++;
            showToast(`${product.name} adicionado ao carrinho!`);
        } else {
            showToast('Quantidade máxima em stock atingida.', 'warning');
            return;
        }
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            qty: 1,
            stock: product.stock,
            imageUrl: (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null
        });
        showToast(`${product.name} adicionado ao carrinho!`);
    }

    cartStore.set(cart); // Salva o carrinho e notifica os listeners (que atualizam o contador no header)

    // Feedback visual, igual ao do catálogo
    button.textContent = 'Adicionado!';
    button.disabled = true;
    setTimeout(() => {
        button.textContent = 'Adicionar ao Carrinho';
        button.disabled = false;
    }, 1500);
}

/**
 * Renderiza os detalhes do produto no ecrã.
 */
function renderProduct(p) {
    if (!productDetailEl) return;
    document.title = `${p.name} - Olomi`; // Atualiza o título da página

    const imageUrl = p.imageUrls && p.imageUrls.length > 0 
        ? p.imageUrls[0] 
        : 'https://placehold.co/600x600/f39c12/fff?text=Olomi';

    productDetailEl.innerHTML = `
        <div class="product-image-gallery">
          <img src="${imageUrl}" alt="${p.name}">
        </div>
        <div class="product-info">
          <h2 class="product-title-large">${p.name}</h2>
          <p class="product-price-large">${BRL(p.price)}</p>
          <p class="product-description-large">${p.description || 'Descrição não disponível.'}</p>
          <button class="add-to-cart-btn-large">Adicionar ao Carrinho</button>
        </div>
    `;

    const button = productDetailEl.querySelector('.add-to-cart-btn-large');

    if (p.stock <= 0) {
        button.disabled = true;
        button.textContent = 'Produto Esgotado';
    } else {
        button.addEventListener('click', () => {
            // A ação de clique agora chama a função handleAddToCart correta
            handleAddToCart(p, button);
        });
    }
}

/**
 * Função principal de inicialização.
 */
async function init() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        productDetailEl.innerHTML = '<p>Produto não encontrado. <a href="/">Volte ao catálogo</a>.</p>';
        return;
    }
    
    if (productDetailEl) productDetailEl.innerHTML = '<div class="spinner"></div>';

    try {
        const docRef = doc(db, "products", productId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentProduct = { id: docSnap.id, ...docSnap.data() };
            renderProduct(currentProduct);
        } else {
            productDetailEl.innerHTML = '<p>Produto não encontrado. <a href="/">Volte ao catálogo</a>.</p>';
        }
    } catch (error) {
        console.error("Erro ao procurar o produto:", error);
        productDetailEl.innerHTML = '<p>Ocorreu um erro ao carregar o produto.</p>';
    }
}

// --- INICIALIZAÇÃO ---
init();
