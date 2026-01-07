<?php
// document_api/upload.php - V9 (存入 next_signer)
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
require "db.php";
ini_set('display_errors', 0);
error_reporting(E_ALL);

try {
    $input = file_get_contents("php://input");
    $data = json_decode($input, true);
    
    $wallet   = trim($data["uploader"] ?? "");
    $fileName = trim($data["name"] ?? "");
    $nodeHash = trim($data["hash"] ?? "");
    $cid      = trim($data["cid"] ?? "");
    $signature= trim($data["signature"] ?? "");
    $prevHash = trim($data["prevHash"] ?? "");
    $txHash   = trim($data["txHash"] ?? "");
    $nextSigner = trim($data["nextSigner"] ?? ""); // 🔥 接收白名單設定

    if ($prevHash === "" || $prevHash === "null") $prevHash = NULL;
    if ($nextSigner === "" || $nextSigner === "null") $nextSigner = NULL;

    if (!$wallet || !$nodeHash) throw new Exception("缺少參數");

    // 1. 轉換 User ID
    $stmtUser = $conn->prepare("SELECT id FROM users WHERE wallet_address = ? LIMIT 1");
    $stmtUser->bind_param("s", $wallet);
    $stmtUser->execute();
    $resUser = $stmtUser->get_result();
    $userRow = $resUser->fetch_assoc();
    $stmtUser->close();

    $userId = 0;
    if ($userRow) {
        $userId = $userRow['id'];
    } else {
        $stmtReg = $conn->prepare("INSERT INTO users (wallet_address, username, created_at) VALUES (?, 'NewUser', NOW())");
        $stmtReg->bind_param("s", $wallet);
        if ($stmtReg->execute()) $userId = $stmtReg->insert_id;
        $stmtReg->close();
    }

    // 2. 寫入 documents (新增 next_signer 欄位)
    $stmt = $conn->prepare("
        INSERT INTO documents 
        (user_id, file_name, file_hash, prev_hash, ipfs_cid, blockchain_tx, next_signer, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    
    // i=int, s=string (共7個s)
    $stmt->bind_param("issssss", $userId, $fileName, $nodeHash, $prevHash, $cid, $txHash, $nextSigner);

    if (!$stmt->execute()) throw new Exception("DB Error: " . $stmt->error);
    $stmt->close();

    echo json_encode(["status" => "success"]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>