const CONFIG = {
    providerURL: "http://127.0.0.1:7545",
    contractAddress: "0xdC78afe9cFDe0576Ff236667DC8c380615c24Ca9",
    ipfsGateway: "http://127.0.0.1:8080",
    apiEndpoint: "http://localhost/document_api"
};

// DOM 元素
const fileTable = document.getElementById("fileTable");
const modal = document.getElementById("detailsModal");
const modalContent = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModalBtn");
const confirmModalBtn = document.getElementById("confirmModalBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

// 狀態變數
let allFiles = [];
let currentPage = 1;
const itemsPerPage = 8;

// 初始化
window.addEventListener("DOMContentLoaded", async () => {
    // 1. 檢查錢包登入
    const savedAddress = localStorage.getItem("walletAddress");
    if (!savedAddress) {
        renderErrorState("請先連接錢包", "lock");
        return;
    }

    // 2. 綁定按鈕
    if (closeModalBtn) closeModalBtn.addEventListener("click", hideModal);
    if (confirmModalBtn) confirmModalBtn.addEventListener("click", hideModal);
    if (modal) modal.addEventListener("click", e => { if (e.target === modal) hideModal(); });
    if (prevPageBtn) prevPageBtn.addEventListener("click", () => changePage(-1));
    if (nextPageBtn) nextPageBtn.addEventListener("click", () => changePage(1));

    // 3. 載入資料 (傳入地址)
    await loadFiles(savedAddress);
});

// 核心功能：載入檔案
async function loadFiles(address) {
    renderLoadingState();

    try {
        const url = `${CONFIG.apiEndpoint}/files.php?uploader=${encodeURIComponent(address)}`;
        console.log("正在讀取 API:", url);

        const resp = await fetch(`${url}&t=${new Date().getTime()}`);

        if (!resp.ok) throw new Error(`API 錯誤 (${resp.status})`);

        // 嘗試解析 JSON
        let files;
        try {
            files = await resp.json();
        } catch (e) {
            const text = await resp.text();
            console.error("PHP 回傳錯誤:", text);
            throw new Error("後端回傳格式錯誤，請檢查 files.php");
        }

        if (!Array.isArray(files) || files.length === 0) {
            renderEmptyState();
            return;
        }

        allFiles = files; // PHP 已經排好序了，這裡直接用
        currentPage = 1;
        renderTable();

    } catch (err) {
        console.error("載入失敗:", err);
        renderErrorState(`無法載入檔案：${err.message}`, "alert-circle");
    }
}

// 渲染表格
function renderTable() {
    fileTable.innerHTML = "";
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedFiles = allFiles.slice(start, end);
    const totalPages = Math.ceil(allFiles.length / itemsPerPage);

    paginatedFiles.forEach(f => {
        // 🔥 對應你的資料庫欄位名稱
        const name = f.file_name || "未知檔案";
        const time = formatTime(f.uploaded_at);
        const cid = f.ipfs_cid || "";
        const hash = f.file_hash || "";

        const tr = document.createElement("tr");
        tr.className = "hover:bg-indigo-50/30 transition-colors border-b border-gray-100 last:border-0";
        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                        <i data-feather="file" class="w-4 h-4"></i>
                    </div>
                    <span class="font-medium text-slate-700 truncate max-w-[150px] cursor-pointer" 
                          title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-500">${time}</td>
            <td class="px-6 py-4 text-center">
                 <a href="${CONFIG.ipfsGateway}/ipfs/${cid}" target="_blank" class="text-slate-400 hover:text-indigo-600 transition">
                    <i data-feather="download" class="w-4 h-4 inline"></i>
                </a>
            </td>
            <td class="px-6 py-4 text-center">
                <button class="text-xs bg-white border border-slate-200 px-3 py-1 rounded-full hover:border-indigo-500 hover:text-indigo-600 transition"
                   onclick="showFileDetails('${escapeAttr(cid)}', '${escapeAttr(hash)}', '${escapeAttr(name)}', '${escapeAttr(time)}')">
                   詳細
                </button>
            </td>
        `;
        fileTable.appendChild(tr);
    });

    feather.replace();
    updatePaginationControls(totalPages);
}

// 分頁控制
function updatePaginationControls(totalPages) {
    if (!pageInfo) return;
    pageInfo.textContent = `第 ${currentPage} / ${totalPages || 1} 頁`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function changePage(dir) {
    const total = Math.ceil(allFiles.length / itemsPerPage);
    if (currentPage + dir >= 1 && currentPage + dir <= total) {
        currentPage += dir;
        renderTable();
    }
}

// Modal
window.showFileDetails = function (cid, hash, name, time) {
    const url = `${CONFIG.ipfsGateway}/ipfs/${cid}`;
    modalContent.innerHTML = `
        <div class="space-y-4">
            <div><label class="text-xs text-slate-400 font-bold">檔名</label><div class="text-slate-800 break-all">${escapeHtml(name)}</div></div>
            <div><label class="text-xs text-slate-400 font-bold">CID</label><div class="bg-slate-50 p-2 rounded text-xs font-mono break-all">${cid}</div></div>
            <div><label class="text-xs text-slate-400 font-bold">Hash</label><div class="bg-slate-50 p-2 rounded text-xs font-mono break-all">${hash}</div></div>
            <div><label class="text-xs text-slate-400 font-bold">時間</label><div>${time}</div></div>
            <a href="${url}" target="_blank" class="block w-full text-center bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">開啟檔案</a>
        </div>
    `;
    modal.classList.remove("hidden");
}
function hideModal() { modal.classList.add("hidden"); }

// 狀態 Helper
function renderLoadingState() { fileTable.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400"><div class="flex flex-col items-center gap-2"><div class="loader"></div><span>正在讀取資料庫...</span></div></td></tr>`; }
function renderEmptyState() { fileTable.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400">尚無檔案</td></tr>`; }
function renderErrorState(msg, icon) { fileTable.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-red-500"><div class="flex flex-col items-center gap-2"><i data-feather="${icon}" class="w-8 h-8"></i><span>${msg}</span></div></td></tr>`; feather.replace(); }

// 工具
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }
function formatTime(t) { return t ? new Date(t).toLocaleString("zh-TW") : '-'; }