import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const form = document.getElementById('create-admin-form');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = form.querySelector('button');
        const name = form.name.value.trim();
        const email = form.email.value.trim();
        const password = form.password.value.trim();
        const confirmPassword = form.confirmPassword.value.trim();

        // Validação da senha
        if (password !== confirmPassword) {
            alert('As senhas não coincidem. Por favor, tente novamente.');
            return;
        }
        if (password.length < 6) {
            alert('A senha deve ter no mínimo 6 caracteres.');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'A criar...';

        try {
            // Passo 1: Criar o utilizador no Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Passo 2: Guardar os detalhes do utilizador (incluindo o nome) na coleção 'users'
            await setDoc(doc(db, 'users', user.uid), {
                name: name,
                email: email,
                createdAt: serverTimestamp()
            });

            // Passo 3: Dar a permissão de administrador na coleção 'roles'
            await setDoc(doc(db, 'roles', user.uid), {
                admin: true
            });

            alert(`Administrador ${name} criado com sucesso!`);
            window.location.href = 'login.html';

        } catch (err) {
            console.error("Erro ao criar administrador:", err);
            alert('Erro ao criar administrador: ' + err.message);
            submitButton.disabled = false;
            submitButton.textContent = 'Criar Administrador';
        }
    });
}
