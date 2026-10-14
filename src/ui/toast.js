let toastTimer = null;

export function showToast(msg) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    if (!toast || !msgEl) return;

    msgEl.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}
