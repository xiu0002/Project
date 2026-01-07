// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DocumentProof {
    
    // 定義單個文件節點的資料結構
    struct Entry {
        address signer;              // [身分認證] 簽署此節點的錢包地址 (msg.sender)
        uint256 timestamp;           // [存在證明] 資料上鏈的時間戳記 (Block Timestamp)
        string cid;                  // [去中心化儲存] IPFS Content ID，指向檔案實體
        bytes signature;             // [不可否認性] 使用者私鑰對 Hash 簽署後的 ECDSA 簽章數據 (r, s, v)
        bytes32 prev;                // [歷程追溯] 指向前一個版本節點的 Hash (Reverse Chaining 指標)
        address authorizedNextSigner; // [權限控制] 指定下一位合法的簽署者 (若為 0x0 則代表公開，若為 Burn Address 則代表鎖定)
    }

    // [核心資料庫] 使用 Mapping 儲存文件雜湊 (nodeHash) 對應的詳細資料
    // Mapping 讀取複雜度為 O(1)，適合快速查找
    mapping(bytes32 => Entry) public entries;

    // [使用者索引] 記錄每個地址參與過的所有文件 Hash，方便前端列出 "My Files"
    mapping(address => bytes32[]) private userEntries;

    // [事件通知] 當文件成功上鏈時觸發，供前端 Web3.js 監聽並更新 UI
    event DocumentStored(
        bytes32 indexed nodeHash,    // 索引鍵：便於查詢特定文件的變更
        bytes32 indexed prev,        // 索引鍵：便於反查歷程
        string cid, 
        address indexed signer,      // 索引鍵：便於查詢特定人的簽署
        uint256 timestamp,
        address nextSigner           // 紀錄下一位指定簽署者
    );

    // ---------------------------
    // [核心演算法] ECDSA 簽章還原
    // ---------------------------
    // @notice 利用橢圓曲線演算法，從簽章與訊息還原出簽署者的公鑰地址
    // @param messageHash: 文件的雜湊值
    // @param signature: 前端傳來的簽署數據 (65 bytes)
    function recoverSigner(bytes32 messageHash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        // 檢查簽章長度是否符合標準 ECDSA 格式 (r=32, s=32, v=1 = 65 bytes)
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        // [組合語言層] 使用 Assembly 進行記憶體操作，拆解簽章參數
        // 這是為了節省 Gas 並精確控制記憶體指標
        assembly {
            // 讀取前 32 bytes -> r (橢圓曲線 X 座標)
            r := mload(add(signature, 32))
            // 讀取次 32 bytes -> s (橢圓曲線純量)
            s := mload(add(signature, 64))
            // 讀取最後 1 byte -> v (恢復 ID)
            v := byte(0, mload(add(signature, 96)))
        }

        // 修正 Ethereum 特有的 v 值偏移 (27 或 28)
        if (v < 27) {
            v += 27;
        }

        // 計算符合 EIP-191 標準的 Signed Message Hash
        // 這是為了防止交易重放攻擊，確保簽名是針對以太坊網絡的
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // 使用 Solidity 內建的 ecrecover 函式進行數學還原，取得地址
        return ecrecover(ethSignedHash, v, r, s);
    }

    // ---------------------------
    // [寫入功能] 儲存初始節點 (Genesis Node)
    // ---------------------------
    function storeInitial(
        bytes32 nodeHash,      // 文件的 SHA-256 Hash
        bytes memory signature, // 使用者的數位簽章
        string memory cid,      // IPFS CID
        address nextSigner      // 指定下一位簽署者 (權限控制)
    ) public {
        // [防呆檢查] 確保此 Hash 從未被上傳過，防止重複存證
        require(entries[nodeHash].timestamp == 0, "Node already stored");

        // [身分驗證] 呼叫 recoverSigner 驗證簽名是否由 msg.sender 發出
        // 這是為了防止惡意使用者拿別人的簽名來偽造存證
        address signer = recoverSigner(nodeHash, signature);
        require(signer == msg.sender, "Signature not from msg.sender");

        // [寫入區塊鏈] 將資料存入 Struct 並寫入 Mapping
        entries[nodeHash] = Entry({
            signer: msg.sender,
            timestamp: block.timestamp, // 使用區塊時間作為存證時間
            cid: cid,
            signature: signature,
            prev: bytes32(0),           // 初始節點的 prev 為 0x0 (代表源頭)
            authorizedNextSigner: nextSigner 
        });

        // 更新使用者的文件列表
        userEntries[msg.sender].push(nodeHash);

        // 發出事件，通知前端上傳成功
        emit DocumentStored(nodeHash, bytes32(0), cid, msg.sender, block.timestamp, nextSigner);
    }

    // ---------------------------
    // [寫入功能] 歷程簽署 (Append / Chain-of-Custody)
    // ---------------------------
    function appendHash(
        bytes32 prevHash,      // 上一個版本的 Hash (用於連結)
        bytes32 nodeHash,      // 當前版本的 Hash
        bytes memory signature, 
        string memory cid, 
        address nextSigner
    ) public {
        // [鏈結完整性檢查] 確保上一筆節點真實存在，否則無法串接
        require(entries[prevHash].timestamp != 0, "Prev node does not exist");
        // [防呆檢查] 確保當前節點未被上傳過
        require(entries[nodeHash].timestamp == 0, "Node already stored");

        // ---------------------------
        // [權限控制核心邏輯] (Access Control)
        // ---------------------------
        address allowed = entries[prevHash].authorizedNextSigner;
        
        // 如果上一筆有指定特定人 (非 0x0)
        if (allowed != address(0)) {
            // 強制檢查：當前的 msg.sender 必須等於上一筆指定的 allowed 地址
            // 這實現了 "白名單" 或 "文件鎖定" (若 allowed 為 Burn Address)
            require(msg.sender == allowed, "Unauthorized: You are not the next signer");
        }

        // [身分驗證] 驗證簽名真實性
        address signer = recoverSigner(nodeHash, signature);
        require(signer == msg.sender, "Signature not from msg.sender");

        // [寫入區塊鏈] 建立新節點，並指向 prevHash
        entries[nodeHash] = Entry({
            signer: msg.sender,
            timestamp: block.timestamp,
            cid: cid,
            signature: signature,
            prev: prevHash,          // 關鍵：將 prev 指標寫死，形成不可篡改的鏈
            authorizedNextSigner: nextSigner
        });

        userEntries[msg.sender].push(nodeHash);

        emit DocumentStored(nodeHash, prevHash, cid, msg.sender, block.timestamp, nextSigner);
    }

    // ---------------------------
    // [讀取功能] View Functions (不消耗 Gas)
    // ---------------------------

    // 快速檢查文件是否存在
    function isNodeStored(bytes32 nodeHash) public view returns (bool) {
        return entries[nodeHash].timestamp != 0;
    }

    // 取得單一節點的完整資料
    function getEntry(bytes32 nodeHash) public view returns (
        address signer, 
        uint256 timestamp, 
        string memory cid, 
        bytes memory signature, 
        bytes32 prev,
        address authorizedNextSigner
    ) {
        Entry storage e = entries[nodeHash];
        return (e.signer, e.timestamp, e.cid, e.signature, e.prev, e.authorizedNextSigner);
    }

    // ---------------------------
    // [核心演算法] 反向追溯驗證 (Reverse Chaining Retrieval)
    // ---------------------------
    // @notice 一次性回傳整條證據鏈的資料，減少前端 RPC 請求次數
    function getChain(bytes32 nodeHash) public view returns (
        bytes32[] memory nodes, 
        address[] memory signers, 
        string[] memory cids, 
        uint256[] memory timestamps,
        address[] memory nextSigners
    ) {
        // [第一步] 計算鏈長度
        // 使用 cursor 指標，從當前節點一路往回追溯到源頭 (prev == 0)
        bytes32 cursor = nodeHash;
        uint256 len = 0;
        while (cursor != bytes32(0) && entries[cursor].timestamp != 0) {
            len++;
            cursor = entries[cursor].prev; // 移動指標到上一層
        }

        // [第二步] 初始化陣列記憶體
        nodes = new bytes32[](len);
        signers = new address[](len);
        cids = new string[](len);
        timestamps = new uint256[](len);
        nextSigners = new address[](len);

        // [第三步] 填入資料
        // 再次重置 cursor，將資料逐一填入陣列
        cursor = nodeHash;
        for (uint256 i = 0; i < len; i++) {
            Entry storage e = entries[cursor];
            nodes[i] = cursor;
            signers[i] = e.signer;
            cids[i] = e.cid;
            timestamps[i] = e.timestamp;
            nextSigners[i] = e.authorizedNextSigner;
            
            cursor = e.prev; // 繼續往回追溯
        }

        return (nodes, signers, cids, timestamps, nextSigners);
    }

    // 取得特定使用者的所有文件 Hash
    function getUserEntries(address user) public view returns (bytes32[] memory) {
        return userEntries[user];
    }
}