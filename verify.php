<?php
// document_api/verify.php - V10 (修正時區顯示問題)
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
require "db.php";

// 🔥 關鍵修正：設定 PHP 時區為台北時間
date_default_timezone_set('Asia/Taipei');

// 除錯設定
ini_set('display_errors', 0);
error_reporting(E_ALL);

try {
    $input = file_get_contents("php://input");
    $data = json_decode($input, true);
    $searchHash = trim($data["hash"] ?? "");

    if (!$searchHash) {
        throw new Exception("未提供 Hash");
    }

    // ==========================================
    // 1. 尋找根節點 (Layer 1)
    // ==========================================
    $sqlRoot = "
        SELECT d.*, u.wallet_address AS signer_address 
        FROM documents d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.file_hash = ? 
        AND (d.prev_hash IS NULL OR d.prev_hash = '' OR d.prev_hash = 'null')
        LIMIT 1
    ";

    $stmt = $conn->prepare($sqlRoot);
    $stmt->bind_param("s", $searchHash);
    $stmt->execute();
    $root = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    // 容錯：找不到根就找當前
    if (!$root) {
        $sqlFallback = "
            SELECT d.*, u.wallet_address AS signer_address 
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.file_hash = ? 
            LIMIT 1
        ";
        $stmt2 = $conn->prepare($sqlFallback);
        $stmt2->bind_param("s", $searchHash);
        $stmt2->execute();
        $root = $stmt2->get_result()->fetch_assoc();
        $stmt2->close();
    }

    if (!$root) {
        echo json_encode(["status" => "not_found", "message" => "資料庫無此紀錄"]);
        exit;
    }

    // ==========================================
    // 2. 構建鏈條 (Chain Traversal)
    // ==========================================
    $chain = [];

    function formatRow($row) {
        // 🔥 時間處理邏輯：
        // 1. 如果有 uploaded_at，用 strtotime 轉成 Timestamp
        // 2. 因為已設定 'Asia/Taipei'，strtotime 會正確解析資料庫的時間
        $ts = $row["uploaded_at"] ? strtotime($row["uploaded_at"]) : time();
        
        return [
            "node" => $row["file_hash"],
            "signer" => $row["signer_address"] ?? ("User ID: " . $row["user_id"]),
            "timestamp" => $ts, 
            "cid" => $row["ipfs_cid"],
            "prev" => $row["prev_hash"]
        ];
    }

    $chain[] = formatRow($root);
    $currentHash = $root["file_hash"];

    // 往後找兒子
    for ($i = 0; $i < 20; $i++) {
        $sqlNext = "
            SELECT d.*, u.wallet_address AS signer_address 
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.prev_hash = ? 
            LIMIT 1
        ";
        $stmtNext = $conn->prepare($sqlNext);
        $stmtNext->bind_param("s", $currentHash);
        $stmtNext->execute();
        $resNext = $stmtNext->get_result();
        
        if ($resNext->num_rows === 0) {
            $stmtNext->close();
            break; 
        }

        $nextRow = $resNext->fetch_assoc();
        $chain[] = formatRow($nextRow);
        
        $currentHash = $nextRow["file_hash"];
        $stmtNext->close();
    }

    // ==========================================
    // 3. 回傳結果
    // ==========================================
    echo json_encode([
        "status" => "verified",
        "hash" => $searchHash,
        "cid" => $root["ipfs_cid"],
        "chain" => array_reverse($chain) 
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>