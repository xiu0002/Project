<?php
// files.php - 修正版：對應你的資料庫結構 (user_id + users 表)

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");
require "db.php";

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $uploader = $_GET["uploader"] ?? "";

    if (!$uploader) {
        echo json_encode([]);
        exit;
    }

    // 🔥 修正 SQL：JOIN users 表格，並選取正確的欄位名稱
    // 你的截圖顯示欄位是：file_name, file_hash, ipfs_cid, uploaded_at
    $sql = "
        SELECT 
            d.file_name, 
            d.file_hash, 
            d.ipfs_cid, 
            d.uploaded_at 
        FROM documents d
        JOIN users u ON d.user_id = u.id
        WHERE LOWER(u.wallet_address) = LOWER(?)
        ORDER BY d.uploaded_at DESC
    ";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(["error" => "SQL Error: " . $conn->error]);
        exit;
    }

    $stmt->bind_param("s", $uploader);
    $stmt->execute();
    $result = $stmt->get_result();

    $files = [];
    while ($row = $result->fetch_assoc()) {
        $files[] = $row; // 直接回傳，JS 那邊已經改好欄位名稱對應了
    }

    echo json_encode($files);
    exit;
}
?>