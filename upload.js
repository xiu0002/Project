const CONFIG = {
    providerURL: "http://127.0.0.1:7545",
    contractAddress: "0xdC78afe9cFDe0576Ff236667DC8c380615c24Ca9",
    ipfsHost: "localhost",
    ipfsPort: 5001,
    ipfsGateway: "http://127.0.0.1:8080", 
    apiEndpoint: "http://localhost/document_api/upload.php",
    statusEndpoint: "http://localhost/document_api/check_status.php"
};

const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

const contractABI = [
    {
        
        "inputs": [
            { "internalType": "bytes32", "name": "prevHash", "type": "bytes32" },
            { "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" },
            { "internalType": "bytes", "name": "signature", "type": "bytes" },
            { "internalType": "string", "name": "cid", "type": "string" },
            { "internalType": "address", "name": "nextSigner", "type": "address" }
        ],
        "name": "appendHash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" },
            { "indexed": true, "internalType": "bytes32", "name": "prev", "type": "bytes32" },
            { "indexed": false, "internalType": "string", "name": "cid", "type": "string" },
            { "indexed": true, "internalType": "address", "name": "signer", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
            { "indexed": false, "internalType": "address", "name": "nextSigner", "type": "address" }
        ],
        "name": "DocumentStored",
        "type": "event"
    },
    {
        
        "inputs": [
            { "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" },
            { "internalType": "bytes", "name": "signature", "type": "bytes" },
            { "internalType": "string", "name": "cid", "type": "string" },
            { "internalType": "address", "name": "nextSigner", "type": "address" }
        ],
        "name": "storeInitial",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        
        "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "name": "entries",
        "outputs": [
            { "internalType": "address", "name": "signer", "type": "address" },
            { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
            { "internalType": "string", "name": "cid", "type": "string" },
            { "internalType": "bytes", "name": "signature", "type": "bytes" },
            { "internalType": "bytes32", "name": "prev", "type": "bytes32" },
            { "internalType": "address", "name": "authorizedNextSigner", "type": "address" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        
        "inputs": [{ "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" }],
        "name": "getChain",
        "outputs": [
            { "internalType": "bytes32[]", "name": "nodes", "type": "bytes32[]" },
            { "internalType": "address[]", "name": "signers", "type": "address[]" },
            { "internalType": "string[]", "name": "cids", "type": "string[]" },
            { "internalType": "uint256[]", "name": "timestamps", "type": "uint256[]" },
            { "internalType": "address[]", "name": "nextSigners", "type": "address[]" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        
        "inputs": [{ "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" }],
        "name": "getEntry",
        "outputs": [
            { "internalType": "address", "name": "signer", "type": "address" },
            { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
            { "internalType": "string", "name": "cid", "type": "string" },
            { "internalType": "bytes", "name": "signature", "type": "bytes" },
            { "internalType": "bytes32", "name": "prev", "type": "bytes32" },
            { "internalType": "address", "name": "authorizedNextSigner", "type": "address" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        
        "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
        "name": "getUserEntries",
        "outputs": [{ "internalType": "bytes32[]", "name": "", "type": "bytes32[]" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        
        "inputs": [{ "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" }],
        "name": "isNodeStored",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    }
];

// 全域變數宣告
let web3;           // 負責與區塊鏈通訊
let contract;       // 負責呼叫合約函式
let ipfs;           // 上傳檔案
let defaultAccount = null; // 當前連接的 MetaMask 錢包地址

// 執行初始化函式
document.addEventListener("DOMContentLoaded", initializeApp);

// [初始化] 系統啟動流程
async function initializeApp() {

    // 文件鎖定的互動效果
    // 勾選鎖定時，自動填入 Burn Address 並禁止修改
    const lockCheck = document.getElementById("lockFileCheckbox");
    const nextInput = document.getElementById("nextSignerInput");
    if (lockCheck && nextInput) {
        lockCheck.addEventListener("change", (e) => {
            if (e.target.checked) {
                nextInput.value = "已設定為鎖定 (禁止簽署)";
                nextInput.disabled = true;
                nextInput.classList.add("bg-gray-100", "text-red-500");
            } else {
                nextInput.value = "";
                nextInput.disabled = false;
                nextInput.classList.remove("bg-gray-100", "text-red-500");
            }
        });
    }

    // 綁定檔案上傳區域 (Drag & Drop 或點擊上傳)
    const fileInput = document.getElementById("fileInput");
    const dropZoneText = document.getElementById("fileNameLabel");
    const uploadBtn = document.getElementById("uploadBtn");

    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                let iconHtml = `<i data-feather="file" class="w-8 h-8 text-slate-400"></i>`;
                if (file.type.startsWith("image/")) {
                    const objectUrl = URL.createObjectURL(file);
                    iconHtml = `<img src="${objectUrl}" class="h-16 w-16 object-cover rounded-lg shadow-sm mb-2">`;
                } else if (file.type === "application/pdf") {
                    iconHtml = `<i data-feather="file-text" class="w-10 h-10 text-red-500 mb-2"></i>`;
                }

                //備檢查檔案是否已存在
                dropZoneText.innerHTML = `
                    <div class="flex flex-col items-center justify-center gap-2">
                        ${iconHtml}
                        <div class="text-slate-700 font-bold text-lg">${file.name}</div>
                        <div class="text-sm text-slate-400 flex items-center gap-1">
                            <i data-feather="loader" class="animate-spin w-3 h-3"></i> 正在檢查合約狀態...
                        </div>
                    </div>
                `;
                feather.replace();

                // 暫時鎖定上傳，直到檢查完成
                uploadBtn.disabled = true;
                uploadBtn.classList.add("opacity-50", "cursor-not-allowed");

                // 呼叫後端 API 檢查檔案雜湊狀態
                await checkFileStatus(file);
            }
        });
    }

    //[Web3 初始化區塊鏈連接
    try {
        if (window.ethereum) {
            // 偵測 MetaMask 
            web3 = new Web3(window.ethereum);

            // 請求使用者授權連接錢包
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            defaultAccount = accounts[0];
            updateWalletUI(defaultAccount); // 更新錢包地址顯示

            // 當使用者在 MetaMask 切換帳號時，更新並重新檢查
            window.ethereum.on('accountsChanged', (accs) => {
                defaultAccount = accs[0];
                updateWalletUI(defaultAccount);
                if (fileInput.files.length > 0) checkFileStatus(fileInput.files[0]);
            });
        } else {
            // 無 MetaMask 時，唯讀模式
            web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.providerURL));
            console.warn("未偵測到 MetaMask");
        }

        contract = new web3.eth.Contract(contractABI, CONFIG.contractAddress);

        await initIPFS();
    } catch (err) { console.error("初始化失敗:", err); }
}

// 核心邏輯檢查檔案狀態 
async function checkFileStatus(file) {
    if (!defaultAccount) {
        alert("請先登入 MetaMask");
        return;
    }

    try {
        // 計算 SHA-256
        // 僅傳送雜湊值
        const buffer = await file.arrayBuffer();
        const hashObj = await sha256(buffer);
        const fileHash = hashObj.hex;

        // 呼叫後端 PHP API 查詢此 Hash 是否已存在於資料庫
        const res = await fetch(CONFIG.statusEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileHash: fileHash })
        });
        const data = await res.json();

        // 取得 UI 元素
        const prevInput = document.getElementById("prevHashInput");
        const statusMsg = document.getElementById("fileNameLabel");
        const uploadBtn = document.getElementById("uploadBtn");

        let canSign = true;
        let message = "";
        let msgColor = "bg-green-50 text-green-700 border-green-200";
        let icon = "check-circle";

        // 根據 API 回傳狀態判斷
        if (data.status === "exists") {
            // 狀態已存在 代表這是歷程簽署 
            console.log("Status:", data);

            // 自動填入上一筆 Hash (prevHash)，建立關係
            prevInput.value = data.latestHash;

            // 權限檢查文件是否已被鎖定 (Burn Address)
            if (data.nextRule && data.nextRule.toLowerCase() === DEAD_ADDRESS.toLowerCase()) {
                canSign = false;
                message = "⛔ 此文件已被鎖定，禁止後續簽署";
                msgColor = "bg-red-50 text-red-700 border-red-200";
                icon = "lock";
            }
            // 權限檢查 2當前用戶是否在白名單內
            else if (data.nextRule &&
                data.nextRule !== "0x0000000000000000000000000000000000000000" &&
                data.nextRule.toLowerCase() !== defaultAccount.toLowerCase()) {
                canSign = false;
                message = `🔒 權限不足：指定下一位簽署者為 ${data.nextRule.slice(0, 6)}...`;
                msgColor = "bg-red-50 text-red-700 border-red-200";
                icon = "x-circle";
            }
            //權限檢查 3是否重複簽署
            else if (data.allSigners && data.allSigners.includes(defaultAccount.toLowerCase())) {
                canSign = false;
                message = "⚠️ 您已簽署過此文件";
                msgColor = "bg-yellow-50 text-yellow-700 border-yellow-200";
                icon = "alert-triangle";
            }
            else {
                // 通過檢查，允許接續簽署
                message = `🔗 已有 ${data.layerCount} 層簽署，您將接續簽署`;
                msgColor = "bg-blue-50 text-blue-700 border-blue-200";
                icon = "git-merge";
            }

        } else {
            // 這是初始上傳 (Initial)
            prevInput.value = ""; // 沒有上一筆
            message = "✨ 新文件，您將是發起人";
            msgColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
            icon = "star";
        }

        // 更新 UI 
        statusMsg.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-2">
                <div class="font-bold text-slate-700 text-lg">${file.name}</div>
                <div class="mt-1 px-4 py-2 text-sm rounded-full border flex items-center gap-2 ${msgColor}">
                    <i data-feather="${icon}" class="w-4 h-4"></i> ${message}
                </div>
            </div>
        `;
        feather.replace();

        // 根據權限決定按鈕是否啟用
        if (canSign) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = `🚀 開始${data.status === "exists" ? "簽署" : "上傳"}與存證`;
            uploadBtn.classList.remove("opacity-50", "cursor-not-allowed");
        } else {
            uploadBtn.disabled = true;
            uploadBtn.innerText = "🚫 無法簽署";
            uploadBtn.classList.add("opacity-50", "cursor-not-allowed");
        }

    } catch (e) {
        console.error(e);
        alert("連線錯誤: " + e.message);
    }
}

// [核心邏輯] 執行上傳與簽署流程
async function uploadFile() {
    const file = document.getElementById("fileInput")?.files?.[0];
    if (!file) return;

    showLoading("準備上傳...");

    try {
        // 1. 讀取檔案並計算 SHA-256 Hash
        const buffer = await file.arrayBuffer();
        const rawHash = await sha256(buffer);
        const fileHash = rawHash.hex; // 這是 nodeHash

        // 2. 上傳至 IPFS 節點 
        // 這裡直接從前端瀏覽器對接 IPFS，不經過後端伺服器，真正去中心化
        updateLoadingText("正在上傳至 IPFS...", 30);
        let cid = "QmOffline"; // 若 IPFS 失敗的預設值
        if (ipfs) {
            try {
                const res = await ipfs.add(buffer);
                cid = res.Hash; // 取得 Content ID (CID)
            } catch (e) {
                console.warn("IPFS 上傳失敗，使用預設 CID");
            }
        }

        // 3. 準備交易參數 (prevHash, nextSigner)
        const prevHashInput = document.getElementById("prevHashInput").value.trim() || null;
        const lockCheck = document.getElementById("lockFileCheckbox");
        const nextInput = document.getElementById("nextSignerInput");
        let nextSigner = "0x0000000000000000000000000000000000000000"; // 預設 0x0 (公開)

        if (lockCheck && lockCheck.checked) {
            nextSigner = DEAD_ADDRESS; // 設定為鎖定
        } else if (nextInput && nextInput.value.trim() !== "") {
            nextSigner = nextInput.value.trim(); // 設定為指定人
        }

        // 4. 計算最終要簽名的 Hash (finalNodeHash)
        let finalNodeHash;
        let isAppend = false;

        if (!prevHashInput) {
            // Case A: 初始上傳 (Initial)
            isAppend = false;
            finalNodeHash = fileHash; // 初始節點直接簽署檔案 Hash

            // 雙重檢查：確認鏈上是否已存在
            const exists = await contract.methods.isNodeStored(finalNodeHash).call();
            if (exists) throw new Error("合約衝突：此文件 Hash 已存在");
        } else {
            // Case B: 歷程簽署 (Append)
            isAppend = true;
            // 混合雜湊：將 (檔案Hash + 上一筆Hash + 簽署者) 打包在一起計算
            // 這是為了綁定「這份文件」是接在「上一筆」後面的
            finalNodeHash = web3.utils.soliditySha3(
                { t: 'bytes32', v: fileHash },
                { t: 'bytes32', v: prevHashInput },
                { t: 'address', v: defaultAccount }
            );
        }

        // 5. 喚起 MetaMask 進行數位簽章
        updateLoadingText("等待錢包簽名...", 60);
        // 使用 personal_sign 方法，這是 Ethereum 標準的簽章方式
        // 私鑰不會離開 MetaMask，這裡只會拿到簽名結果 (Signature)
        const signature = await ethereum.request({
            method: "personal_sign",
            params: [finalNodeHash, defaultAccount]
        });

        // 6. 發送交易至智能合約
        updateLoadingText("正在寫入區塊鏈...", 80);
        let tx;
        if (!isAppend) {
            // 呼叫 storeInitial
            tx = contract.methods.storeInitial(finalNodeHash, signature, cid, nextSigner);
        } else {
            // 呼叫 appendHash
            tx = contract.methods.appendHash(prevHashInput, finalNodeHash, signature, cid, nextSigner);
        }

        // 估算 Gas 費用
        const gas = await tx.estimateGas({ from: defaultAccount }).catch(() => 500000);

        // 發送交易並監聽狀態
        tx.send({ from: defaultAccount, gas })
            .once("transactionHash", (h) => updateLoadingText("交易確認中...", 90))
            .once("confirmation", async (c, receipt) => {

                // 7. 資料同步交易成功後，將 Metadata 寫入 MySQL
                // 這是為了建立索引，方便之後快速查詢 (Hybrid Architecture)
                updateLoadingText("正在同步資料...", 95);
                await fetch(CONFIG.apiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        uploader: defaultAccount,
                        name: file.name,
                        hash: finalNodeHash, // 存證 Hash
                        cid: cid,            // IPFS 位址
                        signature: signature,
                        prevHash: prevHashInput,
                        txHash: receipt.transactionHash, // 交易憑證
                        nextSigner: nextSigner,
                        file_hash_raw: fileHash // 原始檔案 Hash
                    })
                });

                hideLoading();
                // 顯示成功畫面
                renderSuccessState(file.name, cid, receipt.transactionHash);
            })
            .on("error", (e) => {
                hideLoading();
                showResult("交易失敗: " + e.message, "error");
            });

    } catch (e) {
        hideLoading();
        showResult(e.message, "error");
    }
}

// SHA-256 計算
async function sha256(buffer) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hex = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
    return { hex: "0x" + hex, bytes32: "0x" + hex };
}

// 更新錢包 UI
function updateWalletUI(addr) {
    const el = document.getElementById("walletText");
    if (el && addr) {
        el.innerText = addr.slice(0, 6) + "..." + addr.slice(-4);
        document.getElementById("connectWalletBtn").classList.add("bg-green-50", "border-green-200", "text-green-700");
    }
}

// 初始化 IPFS 連接
async function initIPFS() {
    try {
        const res = await fetch(`http://${CONFIG.ipfsHost}:${CONFIG.ipfsPort}/api/v0/id`, { method: "POST" });
        if (!res.ok) throw new Error();
        ipfs = {
            add: async (buffer) => {
                const form = new FormData();
                form.append("file", new Blob([buffer]));
                const r = await fetch(`http://${CONFIG.ipfsHost}:${CONFIG.ipfsPort}/api/v0/add?pin=true`, { method: "POST", body: form });
                return await r.json();
            }
        };
    } catch (e) { console.warn("IPFS 連接失敗", e); }
}

// 顯示 Loading 畫面
function showLoading(text = "處理中...") {
    const loadingDiv = document.getElementById("loading");
    if (!loadingDiv) return;
    const p = loadingDiv.querySelector("p");
    if (p) p.innerText = text;
    loadingDiv.classList.remove("hidden");
    document.getElementById("result")?.classList.add("hidden");
}

function updateLoadingText(text, percent) {
    const p = document.querySelector("#loading p");
    if (p) p.innerText = `${text} (${percent}%)`;
}

function hideLoading() { document.getElementById("loading")?.classList.add("hidden"); }

// 顯示失敗訊息
function showResult(msg, type) {
    const r = document.getElementById("result");
    r.className = `p-4 rounded-xl mt-6 border flex items-center gap-3 ${type === "error" ? "bg-red-50 border-red-100 text-red-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"}`;
    r.innerHTML = msg;
    r.classList.remove("hidden");
    feather.replace();
}

// 渲染成功卡片
function renderSuccessState(fileName, cid, txHash) {
    const resultDiv = document.getElementById("result");
    const uploadBtn = document.getElementById("uploadBtn");

    if (uploadBtn) uploadBtn.classList.add("hidden");

    // 安全地處理 txHash，防止 undefined 錯誤
    const safeTxHash = txHash || "";
    const shortTx = safeTxHash.length > 18 ? `${safeTxHash.substring(0, 10)}...${safeTxHash.substring(safeTxHash.length - 8)}` : safeTxHash;
    const explorerUrl = `https://sepolia.etherscan.io/tx/${safeTxHash}`;

    resultDiv.className = "mt-6 bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden";

    resultDiv.innerHTML = `
        <div class="flex items-center gap-3 p-4 bg-emerald-50 border-b border-emerald-100">
            <div class="bg-white p-1.5 rounded-full text-emerald-600 shadow-sm">
                <i data-feather="check" class="w-5 h-5"></i>
            </div>
            <div>
                <h3 class="text-emerald-800 font-bold text-base">上傳與簽署成功！</h3>
                <p class="text-emerald-600 text-xs">文件已存證，下一位簽署者可直接上傳文件進行接續。</p>
            </div>
        </div>

        <div class="p-5 space-y-4">
            <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                <span class="text-sm text-slate-500 font-medium">檔案名稱</span>
                <span class="text-sm text-slate-800 font-bold truncate max-w-[200px]" title="${fileName}">${fileName}</span>
            </div>

            <div class="flex justify-between items-center">
                <span class="text-sm text-slate-500">交易代碼 (Tx)</span>
                <a href="${explorerUrl}" target="_blank" class="text-sm text-blue-600 hover:text-blue-800 font-mono flex items-center gap-1">
                    ${shortTx} <i data-feather="external-link" class="w-3 h-3"></i>
                </a>
            </div>

            <div class="pt-2 flex gap-3">
                <a href="files.html" class="flex-1 bg-slate-800 text-white text-center py-2.5 rounded-lg text-sm font-medium hover:bg-slate-900 transition">
                    前往檔案管理
                </a>
                <button onclick="location.reload()" class="px-4 py-2.5 text-slate-600 text-sm font-medium hover:bg-slate-100 rounded-lg transition">
                    繼續上傳
                </button>
            </div>
        </div>
    `;

    resultDiv.classList.remove("hidden");
    feather.replace();
}

// 將函式掛載到 window 以供 HTML 呼叫
window.uploadFile = uploadFile;