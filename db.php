<?php
$servername = "localhost";
$username = "root";
$password = "";
$database = "document_api"; // ✅ 改成這個名稱

$conn = new mysqli($servername, $username, $password, $database);

if ($conn->connect_error) {
    die(json_encode(["error" => "Database connection failed: " . $conn->connect_error]));
}
?>
