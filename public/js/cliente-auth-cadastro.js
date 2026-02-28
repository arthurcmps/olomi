import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { showToast } from './utils.js'; // ✅ CORREÇÃO: Importa a função de notificação padronizada.

const registerForm = document.getElementById('register-form');

if (registerForm) {
    const phoneInput = registerForm.phone;
    const cepInput = registerForm.cep;

    // --- MÁSCARA DE TELEFONE ---
    // Formata o valor do campo de telefone em tempo real
    const formatPhone = (value) => {
        if (!value) return "";
        value = value.replace(/\D/g, ''); // Remove tudo o que não é dígito
        value = value.slice(0, 11); // Limita a 11 dígitos (DDD + 9 dígitos)

        if (value.length > 10) {
            // Formato (XX) XXXXX-XXXX para celulares com 9 dígitos
            return value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (value.length > 6) {
            // Formato (XX) XXXX-XXXX para telefones fixos
            return value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        } else if (value.length > 2) {
            // Formato (XX) XXXX
            return value.replace(/(\d{2})(\d+)/, '($1) $2');
        } else if (value.length > 0) {
            // Formato (XX
            return `(${value}`;
        }
        return value;
    };

    phoneInput.addEventListener('input', (e) => {
        e.target.value = formatPhone(e.target.value);
    });

    // --- API DE CEP ---
    const clearAddressFields = () => {
        registerForm.street.value = '';
        registerForm.neighborhood.value = '';
        registerForm.city.value = '';
        registerForm.state.value = '';
    };

    cepInput.addEventListener('input', async (e) => {
        let cep = e.target.value.replace(/\D/g, '');
        cep = cep.slice(0, 8);
        e.target.value = cep; // Mostra apenas os números no campo

        if (cep.length !== 8) {
            clearAddressFields();
            return;
        }

        // Mostra um feedback visual enquanto busca o CEP
        registerForm.street.value = 'Buscando...';
        registerForm.neighborhood.value = 'Buscando...';

        try {
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
            if (!response.ok) throw new Error('CEP não encontrado.');
            
            const data = await response.json();
            if (data.errors) throw new Error(data.errors[0].message);

            // Preenche os campos com os dados do CEP
            registerForm.street.value = data.street;
            registerForm.neighborhood.value = data.neighborhood;
            registerForm.city.value = data.city;
            registerForm.state.value = data.state;
            registerForm.number.focus(); // Move o cursor para o campo de número

        } catch (error) {
            showToast(error.message || 'Erro ao buscar CEP.', 'error');
            clearAddressFields();
        }
    });

    // --- SUBMISSÃO DO FORMULÁRIO ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = registerForm.name.value.trim();
        const phone = phoneInput.value.replace(/\D/g, '');
        const email = registerForm.email.value.trim();
        const password = registerForm.password.value;
        const confirmPassword = registerForm.confirmPassword.value;
        const cep = cepInput.value.replace(/\D/g, '');
        const street = registerForm.street.value.trim();
        const number = registerForm.number.value.trim();
        const complement = registerForm.complement.value.trim();
        const neighborhood = registerForm.neighborhood.value.trim();
        const city = registerForm.city.value.trim();
        const state = registerForm.state.value.trim();

        if (password !== confirmPassword) {
            showToast('As senhas não coincidem. Tente novamente.', 'error');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Salva os dados do usuário no Firestore
            await setDoc(doc(db, 'users', user.uid), {
                name, phone, email,
                address: { cep, street, number, complement, neighborhood, city, state }
            });
            await setDoc(doc(db, 'roles', user.uid), { client: true });

            showToast('Conta criada com sucesso! Redirecionando...', 'success');
            setTimeout(() => { window.location.href = 'minha-conta.html'; }, 2000);

        } catch (error) {
            let msg = 'Ocorreu um erro ao criar a sua conta.';
            if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já está a ser utilizado.';
            else if (error.code === 'auth/weak-password') msg = 'A senha é muito fraca.';
            showToast(msg, 'error');
        }
    });
}
