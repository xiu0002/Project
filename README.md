# 📜 DocChain 永檔鏈：基於區塊鏈的文件存證與歷程追溯系統

### 🏆 畢業專題 | 區塊鏈數位存證解決方案

本專案旨在解決傳統數位文件容易被竄改、來源難以驗證的問題。透過 **Ethereum (智能合約)** 與 **IPFS (去中心化儲存)** 的結合，打造一個具備法律效力、不可篡改且可追溯完整歷程的文件管理平台。

---

## 🏗️ 系統架構 (System Architecture)

本專案採用 **Hybrid (混合式)** 架構，兼顧區塊鏈的「安全性」與傳統資料庫的「效能」：

* **鏈上層 (On-chain Layer)**：儲存文件指紋 (SHA-256 Hash)、簽署者地址以及指針回溯資訊。
* **鏈下層 (Off-chain Layer)**：
    * **IPFS**：去中心化儲存檔案實體。
    * **MySQL**：儲存檔案元數據 (Metadata) 與快速檢索索引。
* **互動層**：使用 **MetaMask** 進行 ECDSA 數位簽章。

---

## 🔥 技術亮點 (Technical Highlights)

### 1. 指針回溯機制 (Pointer Back-tracing)
每一筆新版本存證皆包含 `prevHash` 指向舊版本。驗證時可從最新版出發，沿著指針往回抓取，確保檔案發展歷程完整且具邏輯鏈結。

### 2. 混合式存證驗證
系統不直接將大檔案存入區塊鏈，而是將檔案雜湊化 (Hashing)。只要內容被動過一個字，還原出的地址就會與鏈上紀錄不符，達成「秒級偵測竄改」。

### 3. 身分不可否認性 (ECDSA)
透過 `ecrecover` 函式在鏈上還原簽署者地址。證明該文件確實由持有特定私鑰的錢包地址簽署，具備高度法律存證價值。

---

## 📂 檔案結構說明

根據本專案核心檔案整理：

* **前端介面**：
    * `upload.html` / `upload.js`：處理檔案雜湊運算與發起區塊鏈簽署。
    * `verify.html` / `verify.js`：執行地址還原與防竄改比對邏輯。
    * `files.html` / `files.js`：呈現文件版本鏈與歷程清單。
* **後端邏輯 (PHP)**：
    * `db.php`：資料庫連線核心。
    * `upload.php`：處理檔案元數據存入 MySQL。
    * `check_status.php`：即時追蹤區塊鏈交易確認狀態。
* **智能合約 (Solidity)**：
    * 存放於 `contracts/` 目錄，負責維護鏈上存證指針與身分驗證。

---

## 🛠️ 技術棧 (Tech Stack)

* **Blockchain**: Solidity, Hardhat, Ethers.js
* **Backend**: MySQL
* **Frontend**: HTML5, JavaScript
* **Wallet**: MetaMask

---

## ⚙️ 快速開始 (Setup)

1.  匯入 `database_schema.sql` 至 MySQL。
2.  修改 `db.php` 設定資料庫連線。
3.  確保 MetaMask 已連接至對應的區塊鏈網路。
4.  將程式碼部署至 Apache Server (如 XAMPP) 即可執行。
