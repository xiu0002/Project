<?php
// document_api/check_status.php - V3 (嚴格模式：回傳完整簽署名單)
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
require "db.php";

$input = json_decode(file_get_contents("php://input"), true);
$fileHash = $input["fileHash"] ?? "";

if (!$fileHash) {
    echo json_encode(["status" => "error", "message" => "缺少檔案 Hash"]);
    exit;
}

// 1. 找根節點 (Layer 1)
$stmt = $conn->prepare("SELECT * FROM documents WHERE file_hash = ? AND (prev_hash IS NULL OR prev_hash = '') LIMIT 1");
$stmt->bind_param("s", $fileHash);
$stmt->execute();
$res = $stmt->get_result();
$root = $res->fetch_assoc();
$stmt->close();

if (!$root) {
    echo json_encode(["status" => "new"]);
    exit;
}

// 2. 順藤摸瓜，收集所有簽署者
$currentHash = $root["file_hash"];
$layerCount = 1;
$nextSignerRule = $root["next_signer"];

// 🔥 新增：收集所有參與者的錢包地址
$allSigners = [];

// 2.1 加入第一層簽署者
$uStmt = $conn->prepare("SELECT wallet_address FROM users WHERE id = ?");
$uStmt->bind_param("i", $root["user_id"]);
$uStmt->execute();
$uRes = $uStmt->get_result();
if ($uRow = $uRes->fetch_assoc()) {
    $allSigners[] = strtolower($uRow["wallet_address"]); // 轉小寫以防大小寫差異
}
$uStmt->close();

// 2.2 迴圈找後續節點
while (true) {
    $stmtNext = $conn->prepare("SELECT * FROM documents WHERE prev_hash = ? LIMIT 1");
    $stmtNext->bind_param("s", $currentHash);
    $stmtNext->execute();
    $resNext = $stmtNext->get_result();
    
    if ($resNext->num_rows === 0) {
        $stmtNext->close();
        break; // 沒下一層了，結束
    }

    $row = $resNext->fetch_assoc();
    $currentHash = $row["file_hash"]; // 更新指標
    $nextSignerRule = $row["next_signer"]; // 更新規則
    $layerCount++;

    // 🔥 查這一層的簽署者並加入名單
    $uStmt = $conn->prepare("SELECT wallet_address FROM users WHERE id = ?");
    $uStmt->bind_param("i", $row["user_id"]);
    $uStmt->execute();
    $uRes = $uStmt->get_result();
    if ($uRow = $uRes->fetch_assoc()) {
        $allSigners[] = strtolower($uRow["wallet_address"]);
    }
    $uStmt->close();
    
    $stmtNext->close();
}

// 回傳結果
echo json_encode([
    "status" => "exists",
    "latestHash" => $currentHash,
    "layerCount" => $layerCount,
    "lastSigner" => end($allSigners), // 最後一位
    "allSigners" => $allSigners,      // 🔥 完整名單 (給前端判斷是否重複簽)
    "nextRule" => $nextSignerRule
]);
?>