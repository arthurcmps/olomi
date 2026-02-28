import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { cartStore } from './utils.js';

// --- 1. INJEÇÃO DINÂMICA DO CABEÇALHO E RODAPÉ ---
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

    // Só injeta se a página ainda não tiver um cabeçalho (evita duplicações)
    if (!document.querySelector('.site-header')) {
        document.body.insertAdjacentHTML('afterbegin', headerHTML);
    }

    // Só injeta se a página ainda não tiver um rodapé
    if (!document.querySelector('.site-footer')) {
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    }
}

// Executa a injeção ANTES de procurar os elementos da navegação!
injectHeaderAndFooter();


// --- 2. LÓGICA DE NAVEGAÇÃO E AUTENTICAÇÃO (O seu código original) ---
const userNavContainer = document.getElementById('user-navigation');
const adminLinkContainer = document.getElementById('admin-link-container');

// Garante que os elementos existem antes de tentar usá-los
if (userNavContainer && adminLinkContainer) {
    // Atualiza a contagem do carrinho na inicialização
    cartStore.updateCountUI();

    // Regista um listener para quando o carrinho mudar, para manter a contagem atualizada
    cartStore.onChange(cartStore.updateCountUI);

    // Observa as mudanças no estado de autenticação do utilizador
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Verifica o status de administrador na coleção 'roles'.
            const roleRef = doc(db, 'roles', user.uid);
            const roleSnap = await getDoc(roleRef);
            const isAdmin = roleSnap.exists() && roleSnap.data().admin;

            adminLinkContainer.innerHTML = isAdmin
                ? '<a href="admin.html" class="nav-link">Painel Admin</a>'
                : '';

            userNavContainer.innerHTML = `
                <a href="minha-conta.html" class="nav-link">Minha Conta</a>
                <a href="#" id="logout-btn" class="nav-link">Sair</a>
            `;

            // Adiciona o evento de clique ao botão de logout
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    signOut(auth).then(() => {
                        window.location.href = '/index.html';
                    }).catch((error) => {
                        console.error("Erro ao fazer logout:", error);
                    });
                });
            }

        } else {
            // O utilizador não está autenticado
            adminLinkContainer.innerHTML = ''; 

            userNavContainer.innerHTML = `
                <a href="login-cliente.html" class="nav-link">Entrar</a>
                <a href="cadastro.html" class="nav-link">Registar</a>
            `;
        }
    });
} else {
    console.error('Elementos de navegação do cabeçalho não encontrados. O HTML está correto?');
}