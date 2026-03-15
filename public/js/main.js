import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { cartStore } from './utils.js';

function injectHeaderAndFooter() {
    const headerHTML = `
        <header class="site-header">
            <div class="container">
                <div class="logo-area">
                    <a href="/"><img src="./assets/img/logo.jpg" alt="Olomi Logo" class="logo"></a>
                    <h1><a href="/" style="text-decoration: none; color: inherit;">OLOMI</a></h1>
                </div>
                <nav>
                    <div id="admin-link-container" style="display: inline-block;"></div>
                    <a href="carrinho.html" class="cart-link">Carrinho (<span id="cart-count">0</span>)</a>
                    <div id="user-navigation" style="display: inline-block; margin-left: 1rem;"></div>
                </nav>
            </div>
        </header>
    `;

    const footerHTML = `
        <footer class="site-footer">
            <div class="container">
                <p class="footer-title">Olomi – Artigos Africanos e Religiosos</p>
                <div class="footer-links">
                    <a href="https://wa.me/5519987346984">WhatsApp</a>
                    <span>|</span>
                    <a href="https://www.instagram.com/olomi_rj/" target="_blank">Instagram</a>
                </div>
                <p class="footer-tagline">Axé que fortalece os seus rituais ✨</p>
            </div>
        </footer>
    `;

    if (!document.querySelector('.site-header')) document.body.insertAdjacentHTML('afterbegin', headerHTML);
    if (!document.querySelector('.site-footer')) document.body.insertAdjacentHTML('beforeend', footerHTML);
}

injectHeaderAndFooter();

const userNavContainer = document.getElementById('user-navigation');
const adminLinkContainer = document.getElementById('admin-link-container');

if (userNavContainer && adminLinkContainer) {
    cartStore.updateCountUI();
    cartStore.onChange(cartStore.updateCountUI);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const roleRef = doc(db, 'roles', user.uid);
            const roleSnap = await getDoc(roleRef);
            const isAdmin = roleSnap.exists() && roleSnap.data().admin;

            adminLinkContainer.innerHTML = isAdmin ? '<a href="admin.html" class="nav-link">Painel Admin</a>' : '';
            userNavContainer.innerHTML = `<a href="minha-conta.html" class="nav-link">Minha Conta</a><a href="#" id="logout-btn" class="nav-link">Sair</a>`;

            document.getElementById('logout-btn')?.addEventListener('click', (e) => {
                e.preventDefault();
                signOut(auth).then(() => window.location.href = '/index.html');
            });
        } else {
            adminLinkContainer.innerHTML = ''; 
            userNavContainer.innerHTML = `<a href="login-cliente.html" class="nav-link">Entrar</a><a href="cadastro.html" class="nav-link">Registar</a>`;
        }
    });
}

// ==========================================
// APLICADOR DE TEMA DINÂMICO
// ==========================================
async function applyStoreTheme() {
    try {
        const themeRef = doc(db, 'settings', 'storeTheme');
        const themeSnap = await getDoc(themeRef);
        
        if (themeSnap.exists()) {
            const theme = themeSnap.data();
            
            if (theme.primaryColor) {
                document.documentElement.style.setProperty('--cor-laranja', theme.primaryColor);
                document.documentElement.style.setProperty('--cor-laranja-hover', theme.primaryColor + 'dd');

                let dynamicStyle = document.getElementById('dynamic-theme-css');
                if (!dynamicStyle) {
                    dynamicStyle = document.createElement('style');
                    dynamicStyle.id = 'dynamic-theme-css';
                    document.head.appendChild(dynamicStyle);
                }
                
                dynamicStyle.innerHTML = `
                    button, button[type="submit"], .submit-btn, .add-to-cart-btn, .add-to-cart-btn-large, .btn-primary {
                        background-color: ${theme.primaryColor} !important;
                        color: #ffffff !important;
                        border: none !important;
                    }
                    button:hover, button[type="submit"]:hover, .submit-btn:hover, .add-to-cart-btn:hover, .add-to-cart-btn-large:hover, .btn-primary:hover {
                        background-color: ${theme.primaryColor}dd !important; 
                    }
                    .login-logo, .logo-edit-container { border-color: ${theme.primaryColor} !important; }
                    .back-link, .login-link, .nav-link, .cart-link { color: ${theme.primaryColor} !important; }
                    .nav-link:hover, .cart-link:hover { color: #ffffff !important; }
                    .product-price-large { color: ${theme.primaryColor} !important; }
                    .login-form legend { border-bottom-color: ${theme.primaryColor} !important; }

                    /* --- A MÁGICA DA ANIMAÇÃO CORRIGIDA --- */
                    @keyframes blink-anim {
                        0% { opacity: 1; }
                        50% { opacity: 0.2; }
                        100% { opacity: 1; }
                    }
                    @keyframes scroll-anim {
                        0% { transform: translateX(100vw); } /* 🔴 100vw = Nasce totalmente à direita da tela */
                        100% { transform: translateX(-100%); } /* Morre à esquerda */
                    }
                    .faixa-blink { animation: blink-anim 1.5s infinite ease-in-out; }
                    .faixa-scroll {
                        display: inline-block;
                        white-space: nowrap;
                        animation: scroll-anim 15s linear infinite;
                        will-change: transform; /* Deixa o movimento fluido no telemóvel */
                    }
                `;
            }

            if (theme.topBarMessage && theme.topBarMessage.trim() !== '') {
                if (!document.getElementById('dynamic-top-bar')) {
                    const topBarContainer = document.createElement('div');
                    topBarContainer.id = 'dynamic-top-bar';
                    // 🔴 O contêiner agora usa Flexbox para impedir achatamentos
                    topBarContainer.style.cssText = `background-color: var(--cor-laranja); color: white; padding: 8px 15px; font-size: 0.9rem; font-weight: bold; width: 100%; box-sizing: border-box; z-index: 1000; overflow: hidden; display: flex; align-items: center; height: 40px;`;
                    
                    const textSpan = document.createElement('div');
                    textSpan.textContent = theme.topBarMessage;

                    if (theme.topBarAnimation === 'blink') {
                        textSpan.className = 'faixa-blink';
                        topBarContainer.style.justifyContent = 'center'; 
                    } else if (theme.topBarAnimation === 'scroll') {
                        textSpan.className = 'faixa-scroll';
                        // Sem justify-content, para o texto poder passear livremente
                    } else {
                        topBarContainer.style.justifyContent = 'center';
                    }

                    topBarContainer.appendChild(textSpan);
                    document.body.insertBefore(topBarContainer, document.body.firstChild);
                }
            }

            if (theme.logoUrl) {
                document.querySelectorAll('.logo, .login-logo').forEach(img => img.src = theme.logoUrl);
            }
        }
    } catch (error) { 
        console.error("Erro ao aplicar tema:", error); 
    }
}

applyStoreTheme();