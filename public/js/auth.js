import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { showToast } from './utils.js';

const loginForm = document.getElementById('login-form');
const resetPasswordLink = document.getElementById('reset-password-link');

// Processo de Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = loginForm.email.value.trim();
        const password = loginForm.password.value.trim();
        const submitButton = loginForm.querySelector('button');

        submitButton.disabled = true;
        submitButton.textContent = 'A verificar...';

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Verifica a função (role) do utilizador no Firestore
            const roleRef = doc(db, 'roles', user.uid);
            const roleSnap = await getDoc(roleRef);

            if (roleSnap.exists() && roleSnap.data().admin) {
                // Se for admin, redireciona para o painel de admin
                window.location.href = 'admin.html';
            } else {
                // Se não for admin, desloga imediatamente e lança um erro
                await signOut(auth);
                throw new Error('Acesso não autorizado. Apenas para administradores.');
            }

        } catch (error) {
            console.error('Erro no login:', error);
            // Personaliza a mensagem para o nosso erro customizado ou erros do Firebase
            const errorMessage = error.message.includes('Acesso não autorizado') 
                ? error.message 
                : 'Credenciais inválidas ou utilizador não encontrado.'; // Mensagem mais genérica para segurança
            showToast(errorMessage, 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Entrar';
        }
    });
}

// Processo de Reset de Senha
if (resetPasswordLink) {
    resetPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();

        const { value: email } = await Swal.fire({
            title: 'Recuperar Senha',
            input: 'email',
            inputLabel: 'Insira o seu e-mail para receber o link de redefinição',
            inputPlaceholder: 'seu.email@exemplo.com',
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            showCancelButton: true,
            customClass: {
                confirmButton: 'submit-btn',
                cancelButton: 'cancel-btn'
            },
            buttonsStyling: false
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                showToast('Link para redefinição de senha enviado para o seu e-mail!', 'success');
            } catch (error) {
                console.error('Erro ao enviar e-mail de redefinição:', error);
                showToast(`Erro: ${error.code}`, 'error');
            }
        }
    });
}
