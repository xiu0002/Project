const connectBtn = document.getElementById("connectWalletBtn");
const logoutMenu = document.getElementById("logoutMenu");
const logoutBtn = document.getElementById("logoutBtn");

// 抓取可能存在的文字 Span 
const walletTextSpan = document.getElementById("walletText") || document.getElementById("walletAddressText");

let currentAccount = null;

// 初始化 
window.addEventListener("DOMContentLoaded", () => {
    // 1. 檢查 LocalStorage
    const savedAccount = localStorage.getItem("walletAddress");
    if (savedAccount) {
        currentAccount = savedAccount;
        updateUI(currentAccount);
    } else {
        resetUI();
    }

    // 2. 啟動 MetaMask 監聽器
    setupMetaMaskListeners();

    // 3. 點擊其他地方關閉選單
    document.addEventListener("click", (e) => {
        if (connectBtn && !connectBtn.contains(e.target) &&
            logoutMenu && !logoutMenu.contains(e.target)) {
            logoutMenu.classList.add("hidden");
        }
    });
});

// 連接錢包 
async function connectWallet() {
    if (typeof window.ethereum === "undefined") {
        alert("請先安裝 MetaMask！");
        window.open("https://metamask.io/download.html", "_blank");
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        handleAccountsChanged(accounts); 
    } catch (err) {
        console.error("❌ 錢包連接失敗:", err);
    }
}

// 設定 MetaMask 監聽器 
function setupMetaMaskListeners() {
    if (typeof window.ethereum !== "undefined") {
        // 監聽帳號切換
        window.ethereum.on('accountsChanged', (accounts) => {
            console.log("偵測到帳號切換:", accounts);
            handleAccountsChanged(accounts);
        });

        // 監聽鏈切換 (建議重整頁面)
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }
}

// 處理帳號變更邏輯 
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // 使用者在 MetaMask 斷開連線
        logout();
    } else if (accounts[0] !== currentAccount) {
        // 帳號已變更 (切換帳號)
        currentAccount = accounts[0];
        localStorage.setItem("walletAddress", currentAccount);
        updateUI(currentAccount);

        //  自動刷新當前頁面的資料 (無需手動 F5)

        // 1. 如果在檔案管理頁 (files.html)，重新載入列表
        if (typeof window.loadFiles === 'function') {
            window.loadFiles();
        }

        // 2. 如果在上傳頁 (upload.html) 且已選檔案，重新檢查該檔案權限
        if (typeof window.checkFileStatus === 'function' && document.getElementById('fileInput')?.files?.length > 0) {
            window.checkFileStatus(document.getElementById('fileInput').files[0]);
        }
    }
}

// 更新畫面 
function updateUI(account) {
    if (!connectBtn) return;

    const shortAddr = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;

    // 如果 HTML 裡有專門放文字的 span，就更新 span，保留 icon
    if (walletTextSpan) {
        walletTextSpan.textContent = shortAddr;
    } else {
        // 否則直接修改按鈕文字
        connectBtn.textContent = shortAddr;
    }

    // 改變按鈕行為：點擊變成切換選單
    connectBtn.onclick = (e) => {
        e.stopPropagation();
        logoutMenu.classList.toggle("hidden");
    };

    connectBtn.classList.add("bg-indigo-50", "text-indigo-600", "border-indigo-200");
}

// 重置畫面 (未登入狀態) 
function resetUI() {
    if (!connectBtn) return;

    const defaultText = "🔐 連接錢包";

    if (walletTextSpan) {
        walletTextSpan.textContent = defaultText;
    } else {
        connectBtn.textContent = defaultText;
    }

    // 恢復按鈕行為：點擊進行登入
    connectBtn.onclick = connectWallet;

    // 恢復樣式
    connectBtn.classList.remove("bg-indigo-50", "text-indigo-600", "border-indigo-200");
    if (logoutMenu) logoutMenu.classList.add("hidden");
}

// 登出 
function logout() {
    localStorage.removeItem("walletAddress");
    currentAccount = null;
    resetUI();

    // 登出時通常建議重整或導回首頁，避免舊資料殘留
    if (window.location.pathname.includes("home.html")) {
        window.location.reload();
    } else {
        window.location.href = "home.html";
    }
}

// 綁定登出按鈕 
if (logoutBtn) logoutBtn.addEventListener("click", logout);