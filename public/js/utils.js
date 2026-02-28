// --- Centralized Cart Management ---

const CART_STORAGE_KEY = 'cart';

// Private functions for cart logic
function getCartFromStorage() {
    try {
        return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
    } catch (e) {
        console.error("Failed to parse cart from localStorage", e);
        return [];
    }
}

function saveCartToStorage(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

// Listener for changes
let cartChangeCallback = () => {};

// The single, centralized cart store object
export const cartStore = {
    get: getCartFromStorage,
    set: (cart) => {
        saveCartToStorage(cart);
        cartChangeCallback(cart); // Notify listener on change
    },
    clear: () => {
        localStorage.removeItem(CART_STORAGE_KEY);
        cartChangeCallback([]); // Notify listener
    },
    onChange: (callback) => {
        cartChangeCallback = callback;
    },
    // Helper function to update count on any page
    updateCountUI: () => {
        const cart = getCartFromStorage();
        const cartCountEl = document.getElementById('cart-count');
        if (cartCountEl) {
            cartCountEl.textContent = cart.reduce((count, item) => count + item.qty, 0);
        }
    }
};

// --- Utility Functions ---

/**
 * Formats a number into BRL currency string.
 * @param {number} value - The number to format.
 * @returns {string} - Formatted currency string (e.g., "R$ 12,34").
 */
export function BRL(value) {
    if (typeof value !== 'number') return "R$ 0,00";
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Displays a toast notification using SweetAlert2.
 * Assumes SweetAlert2 library is loaded on the page.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'warning', 'info'.
 */
export function showToast(message, type = 'info') {
    if (typeof Swal === 'undefined') {
        console.error('SweetAlert2 is not loaded. Please include it in your HTML.');
        alert(message); // Fallback to a simple alert
        return;
    }

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    Toast.fire({
        icon: type,
        title: message
    });
}


function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

/**
 * Shows a confirmation dialog using SweetAlert2.
 * Assumes SweetAlert2 library (sweetalert2.all.min.js) is loaded on the page.
 * @param {string} title - The title of the dialog.
 * @param {string} text - The descriptive text.
 * @returns {Promise<boolean>} - Resolves true if confirmed, false otherwise.
 */
export async function showConfirmation(title, text) {
    // Check if Swal is available
    if (typeof Swal === 'undefined') {
        console.error('SweetAlert2 is not loaded. Please include it in your HTML.');
        // Fallback to native confirm
        return window.confirm(`${title}\n\n${text}`);
    }

    const result = await Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, confirmo!',
        cancelButtonText: 'Cancelar',
    });
    return result.isConfirmed;
}
