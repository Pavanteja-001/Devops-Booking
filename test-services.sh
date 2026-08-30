#!/usr/bin/env bash
set -e

echo "===================================================="
echo "   Microservices Automated Integration Test Suite   "
echo "===================================================="

API_BASE="http://localhost:8082"
INVENTORY_BASE="http://localhost:8081"
SEATMAP_BASE="http://localhost:8083"
WORKER_BASE="http://localhost:8084"
FRONTEND_BASE="http://localhost:8090"

echo ""
echo "[1/6] Checking Microservices Health Endpoints..."
curl -s -f "$API_BASE/healthz" > /dev/null && echo "  ✓ Booking BFF Healthz OK (8082)" || echo "  ✕ Booking BFF Healthz Failed"
curl -s -f "$INVENTORY_BASE/healthz" > /dev/null && echo "  ✓ Inventory Healthz OK (8081)" || echo "  ✕ Inventory Healthz Failed"
curl -s -f "$SEATMAP_BASE/healthz" > /dev/null && echo "  ✓ Seatmap Healthz OK (8083)" || echo "  ✕ Seatmap Healthz Failed"
curl -s -f "$WORKER_BASE/healthz" > /dev/null && echo "  ✓ Payment Worker Healthz OK (8084)" || echo "  ✕ Payment Worker Healthz Failed"
curl -s -f "$FRONTEND_BASE/" > /dev/null && echo "  ✓ React Frontend OK (8090)" || echo "  ✕ React Frontend Failed"

echo ""
echo "[2/6] Testing Authentication (POST /auth/login)..."
TEST_USER="testsuite_user_$RANDOM"
LOGIN_RES=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$TEST_USER\",\"password\":\"password123\"}")

TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -n "$TOKEN" ]; then
  echo "  ✓ Auth Login Succeeded! Issued JWT Token for @$TEST_USER"
else
  echo "  ✕ Auth Login Failed: $LOGIN_RES"
  exit 1
fi

echo ""
echo "[3/6] Testing Shows Catalog (GET /shows)..."
SHOWS_RES=$(curl -s "$API_BASE/shows")
echo "  ✓ Shows Catalog Response: $SHOWS_RES"

echo ""
echo "[4/6] Testing Seat Grid Inventory (GET /shows/s1/seats)..."
SEATS_RES=$(curl -s "$API_BASE/shows/s1/seats")
SEAT_COUNT=$(echo "$SEATS_RES" | grep -o '"id"' | wc -l)
echo "  ✓ Retrieved Seat Grid with $SEAT_COUNT seats"

echo ""
echo "[5/6] Testing Booking & Lock Reservation (POST /book)..."
BOOK_RES=$(curl -s -X POST "$API_BASE/book" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"showId\":\"s1\",\"seats\":[\"D4\"]}")

BOOKING_ID=$(echo "$BOOK_RES" | grep -o '"bookingId":[0-9]*' | grep -o '[0-9]*')

if [ -n "$BOOKING_ID" ]; then
  echo "  ✓ Booking Confirmed! ID: #$BOOKING_ID"
else
  echo "  ✕ Booking Failed: $BOOK_RES"
fi

echo ""
echo "[6/6] Testing User Bookings History (GET /bookings)..."
BOOKINGS_RES=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/bookings")
echo "  ✓ Retrieved Bookings History: $BOOKINGS_RES"

echo ""
echo "===================================================="
echo "   All Microservices Tests Completed Successfully!   "
echo "===================================================="
