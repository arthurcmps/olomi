
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';
import { showToast } from './utils.js';

const loginClienteForm = document.getElementById('login-cliente-form');
if (loginClienteForm) {
    loginClienteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginClienteForm.email.value.trim();
        const password = loginClienteForm.password.value.trim();
        
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // **NOVA VERIFICAÇÃO**
            const roleRef = doc(db, 'roles', user.uid);
            const roleSnap = await getDoc(roleRef);

            // Verifica se o utilizador é um administrador
            if (roleSnap.exists() && roleSnap.data().admin) {
                // Se for admin, desloga e informa para usar o login de admin
                await signOut(auth);
                throw new Error('Login de administrador. Utilize a página de login correta.');
            }

            // Se for cliente, continua o fluxo normal
            const params = new URLSearchParams(window.location.search);
            const redirectUrl = params.get('redirect');
            // Redireciona para a página inicial, que é um destino mais lógico
            window.location.href = 'index.html'; 

        } catch (error) {
            console.error("Erro ao entrar:", error);
            const errorMessage = error.message.includes('Login de administrador')
                ? error.message
                : 'Erro ao entrar: Verifique o seu e-mail e senha.';
            showToast(errorMessage, 'error');
        }
    });
}

// Funcionalidade de redefinição de senha
const forgotPasswordLink = document.getElementById('reset-password-link');
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const { value: email } = await Swal.fire({
            title: 'Redefinir a sua senha',
            input: 'email',
            inputLabel: 'Para receber o link de redefinição, insira o seu e-mail abaixo',
            inputPlaceholder: 'seunome@exemplo.com',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Enviar',
            confirmButtonColor: '#000000',
            cancelButtonColor: '#777777',
        });

        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                showToast('E-mail de redefinição enviado com sucesso!', 'success');
            } catch (error) {
                console.error("Erro ao enviar o e-mail de redefinição:", error);
                showToast('Falha ao enviar e-mail. Verifique o endereço inserido.', 'error');
            }
        }
    });
}
