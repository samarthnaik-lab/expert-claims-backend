# Test Customer Dashboard API with jwt_token header
# This simulates what the frontend is sending

$jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo0LCJlbWFpbCI6ImN1c3RvbWVyQGNvbXBhbnkuY29tIiwicm9sZSI6ImN1c3RvbWVyIiwiaWF0IjoxNzY2NDkxMjczLCJleHAiOjE3NjY1MDIwNzN9.q01PR8Q7u-ZsApCKCZGoJ-l8eFFXTYvLcVw0f4pionI"
$sessionId = "020c840d-7746-4a9c-b43f-6a152561d866"

Write-Host "Testing Customer Dashboard API..." -ForegroundColor Cyan
Write-Host "Using jwt_token header (user_id should be extracted automatically)" -ForegroundColor Yellow
Write-Host ""

# Test Dashboard API - user_id extracted from jwt_token header
$dashboardResponse = Invoke-RestMethod -Uri "http://localhost:3000/customer/customer-dashboard" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/x-www-form-urlencoded"
    "jwt_token" = $jwtToken
    "session_id" = $sessionId
  } `
  -Body ""

Write-Host "Dashboard Response:" -ForegroundColor Green
$dashboardResponse | ConvertTo-Json -Depth 5

Write-Host "`n`nTesting Customer Cases API..." -ForegroundColor Cyan
Write-Host "Using jwt_token header (user_id should be extracted automatically)" -ForegroundColor Yellow
Write-Host ""

# Test Cases API - user_id extracted from jwt_token header
$casesResponse = Invoke-RestMethod -Uri "http://localhost:3000/customer/customer-case" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/x-www-form-urlencoded"
    "jwt_token" = $jwtToken
    "session_id" = $sessionId
  } `
  -Body "page=1&size=10"

Write-Host "Cases Response:" -ForegroundColor Green
$casesResponse | ConvertTo-Json -Depth 5

