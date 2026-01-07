const CONFIG = {
    contractAddress: "0xdC78afe9cFDe0576Ff236667DC8c380615c24Ca9",
    ipfsGateway: "http://127.0.0.1:8080",
    verifyAPI: "http://localhost/document_api/verify.php"
};

const contractABI = [
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
        "inputs": [{ "internalType": "bytes32", "name": "nodeHash", "type": "bytes32" }],
        "name": "isNodeStored", 
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    }
];

let web3, contract;
window.verifyData = null; // 儲存驗證結果，供 PDF 下載使用

// 初始化流程
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚀 verify.js 初始化...");

    // 綁定拖曳上傳與點擊驗證的事件
    bindUploadUI();
    const verifyBtn = document.getElementById("verifyBtn");
    if (verifyBtn) verifyBtn.addEventListener("click", verifyFile);

    // Web3 初始化連接 MetaMask
    try {
        if (!window.ethereum) {
            console.warn("MetaMask not detected (僅能使用本地資料庫驗證)");
        } else {
            web3 = new Web3(window.ethereum);

            // 自動偵測並顯示當前錢包地址
            const accounts = await window.ethereum.request({ method: "eth_accounts" });
            if (accounts.length > 0) {
                updateWalletUI(accounts[0]);
            }

            // 監聽帳號切換事件
            window.ethereum.on('accountsChanged', (accs) => {
                updateWalletUI(accs[0]);
            });

            // 實例化合約物件 (用於鏈上驗證)
            contract = new web3.eth.Contract(contractABI, CONFIG.contractAddress);
            console.log("✅ Web3 連線成功");
        }
    } catch (err) {
        console.error("Web3 Error:", err);
    }
});

// 更新錢包地址顯示
function updateWalletUI(address) {
    const displayEl = document.getElementById("walletAddressDisplay");
    if (displayEl && address) {
        const short = address.slice(0, 6) + "..." + address.slice(-4);
        displayEl.innerText = short;
        displayEl.classList.add("bg-blue-100", "text-blue-700", "border", "border-blue-200");
        displayEl.classList.remove("bg-blue-50", "text-blue-600");
    }
}

// 綁定拖曳 (Drag & Drop) 與檔案選取
function bindUploadUI() {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("verifyFileInput");
    const fileNameLabel = document.getElementById("fileNameLabel");

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            fileNameLabel.textContent = file ? `📄 已選取：${file.name}` : "尚未選取檔案";
            if (file && dropZone) {
                dropZone.classList.add("border-blue-500", "bg-blue-50");
            }
        });
    }

    // 拖曳效果處理
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault(); dropZone.classList.remove("dragover");
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                // 手動觸發 change 事件以更新 UI
                const event = new Event('change');
                fileInput.dispatchEvent(event);
            }
        });
    }
}

// 檔案驗證
async function verifyFile() {
    const fileInput = document.getElementById("verifyFileInput");
    const file = fileInput?.files?.[0];

    if (!file) {
        alert("⚠ 請先選取檔案！");
        return;
    }

    // 重置 UI 狀態，顯示 Loading
    document.getElementById("loading").classList.remove("hidden");
    document.getElementById("resultSection").classList.add("hidden");

    try {
        // 前端計算 SHA-256
        // 檔案內容不會上傳伺服器，僅透過雜湊值進行比對
        const buf = await file.arrayBuffer();
        const hashObj = await calculateFileHash(buf);
        const sourceText = file.name;
        console.log("File Hash:", hashObj.hex);

        let verifyResult = null;

        // [第一層驗證] 本地資料庫查詢
        // 優點：速度快，可顯示完整歷程
        const dbRes = await checkLocalVerification(hashObj.hex);

        if (dbRes && (dbRes.status === "verified" || dbRes.status === "found")) {
            // 資料庫驗證成功
            verifyResult = {
                source: sourceText,
                cid: dbRes.cid || null,
                nodeHash: hashObj.hex,
                hash: hashObj.hex,
                verified: true,
                chain: dbRes.chain || [] // 取得歷程資料
            };
        } else {
            // [第二層驗證] 區塊鏈直接查詢 (On-chain Verification)
            // 只有當資料庫查不到時，才直接去問區塊鏈 (Fallback 機制)
            console.log("轉向鏈上查詢...");
            if (!contract || !web3) throw new Error("請連接 MetaMask 以進行鏈上驗證");

            // 呼叫遞迴驗證函式
            const chainResult = await verifyChainFrom(hashObj.bytes32);

            if (chainResult.status !== "verified") {
                if (chainResult.status === "not_found") throw new Error("查無此文件（資料庫與鏈上皆無紀錄）");
                else throw new Error("驗證失敗: " + chainResult.status);
            }

            // 鏈上驗證成功
            verifyResult = {
                source: sourceText,
                cid: (chainResult.chain[0]?.cid) || null,
                nodeHash: hashObj.hex,
                hash: hashObj.hex,
                verified: true,
                chain: chainResult.chain
            };
        }

        // 儲存全域變數
        window.verifyData = verifyResult;

        // 渲染驗證成功訊息
        document.getElementById("result").innerHTML = `
            ✅ 驗證成功！文件指紋與區塊鏈紀錄相符。<br>
            <span class="text-sm text-green-700 mt-1 block">Hash: ${verifyResult.hash}</span>
        `;

        // 簽署歷程時間軸
        renderChainUI(verifyResult.chain);

        document.getElementById("loading").classList.add("hidden");
        document.getElementById("resultSection").classList.remove("hidden");

        // 綁定 PDF 證書下載功能
        const pdfBtn = document.getElementById("downloadCertBtn");
        pdfBtn.onclick = () => downloadPDF(window.verifyData);

    } catch (err) {
        console.error("驗證錯誤:", err);
        document.getElementById("loading").classList.add("hidden");
        alert("❌ " + (err.message || "驗證錯誤"));
    }
}

// 繪製簽署歷程時間軸
function renderChainUI(chain) {
    const container = document.getElementById("chainNodes");
    container.innerHTML = "";

    // 將鏈反轉， Layer 1 在最上面顯示
    const sortedChain = chain ? [...chain].reverse() : [];

    sortedChain.forEach((e, idx) => {
        const level = idx + 1;
        const isLatest = idx === sortedChain.length - 1; // 標記最新版本

        const item = document.createElement("div");
        item.className = "timeline-item";

        item.innerHTML = `
            <div class="timeline-dot ${isLatest ? 'verified' : ''}">${level}</div>
            <div class="timeline-content">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-gray-800 text-lg">
                        ${level === 1 ? '📄 初始建立' : '✍️ 簽署 (Append)'}
                    </span>
                    <span class="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
                        ${new Date(e.timestamp * 1000).toLocaleString()}
                    </span>
                </div>
                <div class="space-y-1 text-sm text-gray-600">
                    <div class="flex items-center">
                        <span class="w-20 font-semibold">Signer:</span>
                        <code class="text-blue-600 bg-blue-50 px-1 rounded">${shortAddr(e.signer)}</code>
                    </div>
                    <div class="flex items-center">
                        <span class="w-20 font-semibold">Node:</span>
                        <code class="text-gray-500">${shortHash(e.node)}</code>
                    </div>
                    ${e.cid ? `
                    <div class="flex items-center">
                        <span class="w-20 font-semibold">IPFS CID:</span>
                        <a href="${CONFIG.ipfsGateway}/ipfs/${e.cid}" target="_blank" class="text-blue-500 hover:underline truncate w-48">${shortHash(e.cid)}</a>
                    </div>` : ''}
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

// [功能] 產生並下載 PDF 驗證證書
function downloadPDF(data) {
    const win = window.open("", "_blank");
    const now = new Date().toLocaleString();
    const chainData = data.chain ? [...data.chain].reverse() : [];

    // 產生表格行
    const rows = chainData.map((e, i) => `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px;">Layer ${i + 1}</td>
            <td style="padding:10px;">${e.signer}</td>
            <td style="padding:10px;">${new Date(e.timestamp * 1000).toLocaleString()}</td>
        </tr>`).join("");

    // 產生完整的 HTML 證書
    const html = `
    <html><head><title>驗證證書</title>
    <style>body{font-family:sans-serif;padding:40px;}h1{border-bottom:3px solid #6366f1;padding-bottom:15px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th{background:#eef2ff;padding:10px;text-align:left;}</style>
    </head><body>
        <h1>永檔鏈 DocChain - 文件驗證證書</h1>
        <p><b>文件指紋：</b> ${data.hash}</p>
        <p><b>驗證結果：</b> <span style="color:green;font-weight:bold;">✔ 通過</span></p>
        <p><b>時間：</b> ${now}</p>
        <h3>簽署歷程</h3>
        <table><thead><tr><th>層級</th><th>簽署者</th><th>時間</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;

    win.document.write(html);
    win.document.close();
    // 自動觸發列印視窗
    setTimeout(() => { win.focus(); win.print(); }, 500);
}

// API 呼叫本地驗證
async function checkLocalVerification(hashHex) {
    try {
        const res = await fetch(CONFIG.verifyAPI, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cid: null, hash: hashHex })
        });
        return await res.json();
    } catch (err) { return { status: "error" }; }
}

// 鏈上遞迴驗證
async function verifyChainFrom(nodeHash) {
    if (!contract) throw new Error("未連接合約");

    let current = nodeHash; // 從當前文件的 Hash 開始
    const chain = [];

    // 設定最大回溯深度 20 層，防止無限迴圈
    for (let i = 0; i < 20; i++) {
        // 呼叫合約取得節點資料
        const entry = await contract.methods.getEntry(current).call();

        // 若 timestamp 為 0，代表節點不存在，驗證失敗
        if (!entry || entry.timestamp == 0) return { status: "not_found" };

        // [ECDSA 雙重確認] 前端再次驗證簽名是否正確 (Double Check)
        let recovered;
        try { recovered = web3.eth.accounts.recover(current, entry.signature); } catch (e) {
            recovered = web3.eth.accounts.recover(current.toString(), entry.signature);
        }

        // 若簽署者不符，拋出錯誤
        if (recovered.toLowerCase() !== entry.signer.toLowerCase()) return { status: "invalid_signature" };

        // 驗證通過，加入歷程陣列
        chain.push({ node: current, cid: entry.cid, signer: entry.signer, timestamp: entry.timestamp, prev: entry.prev });

        // 若 prev 為 0x0，代表已追溯到源頭，停止遞迴
        if (!entry.prev || entry.prev === "0x0000000000000000000000000000000000000000000000000000000000000000") break;

        // 移動指標到上一層
        current = entry.prev;
    }
    return { status: "verified", chain };
}

// 輔助函式
async function calculateFileHash(buffer) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hex = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
    return { hex: "0x" + hex, bytes32: "0x" + hex };
}

// 縮短地址顯示 (0x1234...abcd)
function shortAddr(addr) { return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : ""; }

// 縮短 Hash 顯示
function shortHash(h) { return h ? h.slice(0, 8) + "..." : ""; }