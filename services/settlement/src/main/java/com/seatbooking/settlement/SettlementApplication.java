package com.seatbooking.settlement;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootApplication
public class SettlementApplication implements CommandLineRunner {

    private static final int SEAT_PRICE_INR = 200;

    private final JdbcTemplate jdbcTemplate;

    public SettlementApplication(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public static void main(String[] args) {
        int exitCode = SpringApplication.exit(SpringApplication.run(SettlementApplication.class, args));
        System.exit(exitCode);
    }

    @Override
    public void run(String... args) {
        if ("true".equalsIgnoreCase(System.getenv("CHAOS_LEAK"))) {
            simulateLeak();
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, show_id, seats FROM bookings WHERE status = 'confirmed' AND settled_at IS NULL");

        if (rows.isEmpty()) {
            System.out.println("settlement: no confirmed bookings to reconcile");
            return;
        }

        Map<String, Integer> totalsByShow = new java.util.HashMap<>();
        List<Object> bookingIds = new ArrayList<>();

        for (Map<String, Object> row : rows) {
            String showId = (String) row.get("show_id");
            Object seatsObj = row.get("seats");
            String[] seats;
            try {
                if (seatsObj instanceof java.sql.Array) {
                    seats = (String[]) ((java.sql.Array) seatsObj).getArray();
                } else if (seatsObj instanceof String[]) {
                    seats = (String[]) seatsObj;
                } else {
                    seats = new String[0];
                }
            } catch (Exception e) {
                seats = new String[0];
            }
            totalsByShow.merge(showId, seats.length * SEAT_PRICE_INR, Integer::sum);
            bookingIds.add(row.get("id"));
        }

        totalsByShow.forEach((showId, total) ->
                System.out.printf("settlement: show %s -> INR %d%n", showId, total));

        jdbcTemplate.update(con -> {
            java.sql.PreparedStatement ps = con.prepareStatement("UPDATE bookings SET settled_at = now() WHERE id = ANY(?)");
            ps.setArray(1, con.createArrayOf("integer", bookingIds.toArray()));
            return ps;
        });

        System.out.printf("settlement: reconciled %d bookings%n", bookingIds.size());
    }

    private void simulateLeak() {
        List<byte[]> leak = new ArrayList<>();
        try {
            while (true) {
                leak.add(new byte[10_000_000]);
                Thread.sleep(50);
            }
        } catch (InterruptedException | OutOfMemoryError e) {
            Thread.currentThread().interrupt();
        }
    }
}
