<?php
header("Content-Type: application/json; charset=utf-8");
require "db.php";

try {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data) throw new Exception("沒有收到 JSON 資料");

    $cid      = trim($data["cid"] ?? "");
    $newName  = trim($data["name"] ?? "");
    $wallet   = trim($data["uploader"] ?? "");

    if (!$cid || !$newName || !$wallet) {
        throw new Exception("缺少必要欄位 (cid/name/uploader)");
    }

    // 1️⃣ 查 user
    $stmtUser = $conn->prepare("SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(?)");
    if (!$stmtUser) throw new Exception("SQL 準備失敗(users): " . $conn->error);

    $stmtUser->bind_param("s", $wallet);
    $stmtUser->execute();
    $res = $stmtUser->get_result();

    if ($res->num_rows === 0) {
        throw new Exception("找不到該使用者，不能更新名稱");
    }
    $userId = $res->fetch_assoc()["id"];
    $stmtUser->close();

    // 2️⃣ 確認該檔案屬於這個 user
    $stmtCheck = $conn->prepare("
        SELECT id FROM documents 
        WHERE user_id = ? AND ipfs_cid = ?
        LIMIT 1
    ");
    $stmtCheck->bind_param("is", $userId, $cid);
    $stmtCheck->execute();
    $check = $stmtCheck->get_result();

    if ($check->num_rows === 0) {
        throw new Exception("你沒有權限修改這份文件");
    }
    $stmtCheck->close();

    // 3️⃣ 更新名稱
    $stmtUp = $conn->prepare("
        UPDATE documents 
        SET file_name = ? 
        WHERE user_id = ? AND ipfs_cid = ?
    ");
    $stmtUp->bind_param("sis", $newName, $userId, $cid);
    $stmtUp->execute();
    $stmtUp->close();

    echo json_encode([
        "success" => true,
        "message" => "檔名已成功更新",
        "cid" => $cid,
        "name" => $newName
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
