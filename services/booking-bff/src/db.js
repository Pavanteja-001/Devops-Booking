import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://booking:booking@localhost:5432/booking_db",
  max: 5,
});

export async function dbPing() {
  await pool.query("SELECT 1");
}

export async function createBooking({ userId, username, showId, holdId, seats }) {
  const { rows } = await pool.query(
    `INSERT INTO bookings (user_id, username, show_id, hold_id, seats, status)
     VALUES ($1, $2, $3, $4, $5, 'pending_payment')
     RETURNING id, status`,
    [userId, username, showId, holdId, seats]
  );
  return rows[0];
}

export async function completeBooking(bookingId) {
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'confirmed' WHERE id = $1
     RETURNING id, show_id, hold_id, seats, status`,
    [bookingId]
  );
  return rows[0];
}

export async function bookingsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, show_id, seats, status, created_at FROM bookings
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}
