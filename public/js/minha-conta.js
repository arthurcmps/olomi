import { auth, db } from './firebase.js';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { BRL, showToast } from './utils.js';

const loadingSpinner = '<div class="spinner"></div>';

async function loadUserData(user, container) {
    if (!container) return;
    container.innerHTML = loadingSpinner;

    try {
        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            container.innerHTML = `
                <form id="user-details-form" class="login-form">
                    <fieldset>
                        <legend>Dados Pessoais</legend>
                        <input name="name" type="text" placeholder="Nome Completo" value="${data.name || ''}" required />
                        <input name="phone" type="tel" placeholder="Telefone / WhatsApp" value="${data.phone || ''}" required />
                    </fieldset>
                    <fieldset>
                        <legend>Endereço de Entrega</legend>
                        <input name="cep" type="text" placeholder="CEP" value="${data.address?.cep || ''}" required />
                        <input name="street" type="text" placeholder="Rua / Logradouro" value="${data.address?.street || ''}" required />
                        <div class="form-grid">
                            <input name="number" type="text" placeholder="Número" value="${data.address?.number || ''}" required />
                            <input name="complement" type="text" placeholder="Complemento (Opcional)" value="${data.address?.complement || ''}" />
                        </div>
                        <input name="neighborhood" type="text" placeholder="Bairro" value="${data.address?.neighborhood || ''}" required />
                        <input name="city" type="text" placeholder="Cidade" value="${data.address?.city || ''}" required />
                        <input name="state" type="text" placeholder="Estado" value="${data.address?.state || ''}" required />
                    </fieldset>
                    <button type="submit" class="submit-btn">Salvar Alterações</button>
                </form>
            `;
            
            const form = document.getElementById('user-details-form');
            form.addEventListener('submit', handleUpdateUserData);

            // --- MELHORIA: Integração com a API ViaCEP ---
            const cepInput = form.querySelector('[name="cep"]');
            cepInput.addEventListener('blur', handleCepBlur);

        } else {
            container.innerHTML = `<p>Não foi possível carregar os seus dados.</p>`;
        }
    } catch (error) {
        console.error("Erro ao carregar dados do utilizador:", error);
        container.innerHTML = `<p>Ocorreu um erro ao carregar os seus dados. Tente novamente mais tarde.</p>`;
    }
}

async function handleUpdateUserData(e) {
    e.preventDefault();
    const form = e.target;
    const user = auth.currentUser;
    if (!user) return;

    // --- MELHORIA: Feedback de carregamento no botão ---
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Salvando...';

    const data = Object.fromEntries(new FormData(form).entries());
    const userRef = doc(db, 'users', user.uid);

    try {
        await updateDoc(userRef, {
            name: data.name,
            phone: data.phone,
            address: {
                cep: data.cep, street: data.street, number: data.number,
                complement: data.complement, neighborhood: data.neighborhood,
                city: data.city, state: data.state
            }
        });
        showToast('Dados atualizados com sucesso!', 'success');
    } catch (error) {
        showToast('Ocorreu um erro ao atualizar os seus dados.', 'error');
    } finally {
        // Garante que o botão é reativado mesmo se ocorrer um erro
        button.disabled = false;
        button.textContent = 'Salvar Alterações';
    }
}

async function handleCepBlur(e) {
    const form = e.target.closest('form');
    const cep = e.target.value.replace(/\D/g, ''); // Remove caracteres não numéricos

    if (cep.length !== 8) return; // Sai se o CEP não tiver 8 dígitos

    form.street.value = '...';
    form.neighborhood.value = '...';
    form.city.value = '...';
    form.state.value = '...';

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            showToast('CEP não encontrado.', 'error');
            form.street.value = '';
            form.neighborhood.value = '';
            form.city.value = '';
            form.state.value = '';
        } else {
            form.street.value = data.logradouro;
            form.neighborhood.value = data.bairro;
            form.city.value = data.localidade;
            form.state.value = data.uf;
            form.number.focus(); // Move o foco para o campo do número
        }
    } catch (error) {
        console.error("Erro ao buscar CEP:", error);
        showToast('Erro ao consultar o CEP.', 'error');
    }
}


async function loadOrderHistory(user, container) {
    if (!container) return;
    container.innerHTML = loadingSpinner;

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            container.innerHTML = '<p>Você ainda não fez nenhuma encomenda.</p>';
            return;
        }

        container.innerHTML = '';
        querySnapshot.forEach(doc => {
            const order = doc.data();
            
            const orderDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('pt-BR') : 'Data pendente';

            let statusText = 'Pendente';
            let statusClass = 'pending';
            if (order.status === 'shipped') {
                statusText = 'Enviado';
                statusClass = 'shipped';
            } else if (order.status === 'cancelled') {
                statusText = 'Cancelado';
                statusClass = 'cancelled';
            }

            const itemsHtml = order.items.map(item => `<li>${item.qty}x ${item.name}</li>`).join('');

            const orderEl = document.createElement('div');
            orderEl.className = 'order-item';
            orderEl.innerHTML = `
                <div class="order-item-header">
                    <span class="order-id">Pedido #${doc.id.substring(0, 6)}</span>
                    <span class="order-status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="order-details">
                    <p><strong>Data:</strong> ${orderDate}</p>
                    <p><strong>Total:</strong> ${BRL(order.total)}</p>
                </div>
                <div class="order-items-list"><strong>Itens:</strong><ul>${itemsHtml}</ul></div>
            `;
            container.appendChild(orderEl);
        });
    } catch (error) {
        console.error("Erro ao carregar o histórico de pedidos: ", error);
        container.innerHTML = '<p>Ocorreu um erro ao carregar o seu histórico de pedidos.</p>';
    }
}

export function initMinhaContaPage(user) {
    const userDetailsContent = document.getElementById('user-details-content');
    const orderHistoryList = document.getElementById('order-history-list');

    if (user) {
        loadUserData(user, userDetailsContent);
        loadOrderHistory(user, orderHistoryList);
    } else {
        if (userDetailsContent) userDetailsContent.innerHTML = '<p>Você precisa de estar autenticado para ver esta página.</p>';
        if (orderHistoryList) orderHistoryList.innerHTML = '';
    }
}
