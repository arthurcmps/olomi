// Importa as funções necessárias dos SDKs do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-functions.js";

// O Firebase Hosting irá carregar e fornecer a configuração automaticamente.
// Faça o fetch da configuração a partir de um URL reservado.
const response = await fetch('/__/firebase/init.json');
const firebaseConfig = await response.json();

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços do Firebase individualmente para que outros módulos possam usá-los
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
