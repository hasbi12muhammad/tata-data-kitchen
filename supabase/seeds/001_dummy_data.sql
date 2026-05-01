-- ============================================================
-- COSTIFY SEED DATA
-- Warung "Dapur Nusantara" — 2 months simulation
-- Feb 14 – Apr 13 2026
--
-- Paste di: Supabase Dashboard → SQL Editor → New Query
-- REQUIRES: at least 1 user in auth.users
-- ============================================================

DO $$
DECLARE
  v_uid uuid;

  -- Item UUIDs
  id_beras        uuid := gen_random_uuid();
  id_ayam         uuid := gen_random_uuid();
  id_minyak       uuid := gen_random_uuid();
  id_bawang_merah uuid := gen_random_uuid();
  id_bawang_putih uuid := gen_random_uuid();
  id_telur        uuid := gen_random_uuid();
  id_tepung       uuid := gen_random_uuid();
  id_gula         uuid := gen_random_uuid();
  id_kopi         uuid := gen_random_uuid();
  id_susu         uuid := gen_random_uuid();
  id_mentega      uuid := gen_random_uuid();
  id_mie          uuid := gen_random_uuid();
  id_kecap        uuid := gen_random_uuid();
  id_cabai        uuid := gen_random_uuid();
  id_santan       uuid := gen_random_uuid();

  -- Recipe UUIDs
  id_r1 uuid := gen_random_uuid(); -- Nasi Goreng Spesial
  id_r2 uuid := gen_random_uuid(); -- Ayam Goreng Kremes
  id_r3 uuid := gen_random_uuid(); -- Es Kopi Susu
  id_r4 uuid := gen_random_uuid(); -- Mie Goreng
  id_r5 uuid := gen_random_uuid(); -- Pancake Susu
  id_r6 uuid := gen_random_uuid(); -- Nasi Ayam Bakar
  id_r7 uuid := gen_random_uuid(); -- Omelet Spesial

  -- Pre-calculated HPP (based on avg_price × quantity_used)
  hpp_r1 numeric := 9710;   -- Nasi Goreng
  hpp_r2 numeric := 10880;  -- Ayam Goreng
  hpp_r3 numeric := 3650;   -- Es Kopi Susu
  hpp_r4 numeric := 4875;   -- Mie Goreng
  hpp_r5 numeric := 11020;  -- Pancake
  hpp_r6 numeric := 13129;  -- Nasi Ayam Bakar
  hpp_r7 numeric := 6880;   -- Omelet

  -- Selling prices
  sp_r1 numeric := 20000;
  sp_r2 numeric := 22000;
  sp_r3 numeric := 18000;
  sp_r4 numeric := 18000;
  sp_r5 numeric := 20000;
  sp_r6 numeric := 28000;
  sp_r7 numeric := 15000;

  d    date;
  dow  int;
  doy  int;
  bm   numeric; -- base multiplier (weekend boost)

BEGIN
  -- Get first user
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No user found. Create a user in Supabase Auth first.';
  END IF;

  RAISE NOTICE 'Seeding data for user: %', v_uid;

  -- ============================================================
  -- 1. ITEMS
  -- ============================================================
  INSERT INTO public.items (id, user_id, name, unit, avg_price, stock, created_at) VALUES
    (id_beras,        v_uid, 'Beras',            'gr',   12.05,  45000, '2026-02-01 08:00'),
    (id_ayam,         v_uid, 'Ayam Fillet',       'gr',   45.10,  18000, '2026-02-01 08:00'),
    (id_minyak,       v_uid, 'Minyak Goreng',     'ml',   17.83,  22000, '2026-02-01 08:00'),
    (id_bawang_merah, v_uid, 'Bawang Merah',      'gr',   35.75,   7500, '2026-02-01 08:00'),
    (id_bawang_putih, v_uid, 'Bawang Putih',      'gr',   28.00,   7500, '2026-02-01 08:00'),
    (id_telur,        v_uid, 'Telur Ayam',        'pcs', 2490.00,  1200, '2026-02-01 08:00'),
    (id_tepung,       v_uid, 'Tepung Terigu',     'gr',   10.07,  22000, '2026-02-01 08:00'),
    (id_gula,         v_uid, 'Gula Pasir',        'gr',   13.77,  16000, '2026-02-01 08:00'),
    (id_kopi,         v_uid, 'Kopi Robusta',      'gr',  120.00,   3200, '2026-02-01 08:00'),
    (id_susu,         v_uid, 'Susu Kental Manis', 'ml',   30.00,   8500, '2026-02-01 08:00'),
    (id_mentega,      v_uid, 'Mentega',           'gr',   80.00,   4000, '2026-02-01 08:00'),
    (id_mie,          v_uid, 'Mie Kering',        'gr',   15.00,  16000, '2026-02-01 08:00'),
    (id_kecap,        v_uid, 'Kecap Manis',       'ml',   25.00,   8000, '2026-02-01 08:00'),
    (id_cabai,        v_uid, 'Cabai Merah',       'gr',   61.25,   3500, '2026-02-01 08:00'),
    (id_santan,       v_uid, 'Santan',            'ml',   12.00,  12000, '2026-02-01 08:00');

  -- ============================================================
  -- 2. PURCHASES (price fluctuation over 2 months)
  -- ============================================================
  -- price_per_unit is a generated column (total_price / quantity), omit from INSERT
  INSERT INTO public.purchases (id, user_id, item_id, quantity, total_price, created_at) VALUES
    -- BERAS (naik pelan)
    (gen_random_uuid(), v_uid, id_beras, 50000,  580000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_beras, 50000,  600000, '2026-02-20 07:00'),
    (gen_random_uuid(), v_uid, id_beras, 50000,  612500, '2026-03-10 07:00'),
    (gen_random_uuid(), v_uid, id_beras, 50000,  620000, '2026-03-28 07:00'),

    -- AYAM FILLET (volatile)
    (gen_random_uuid(), v_uid, id_ayam, 20000,  880000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_ayam, 20000,  900000, '2026-02-15 07:00'),
    (gen_random_uuid(), v_uid, id_ayam, 20000,  920000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_ayam, 20000,  910000, '2026-03-15 07:00'),
    (gen_random_uuid(), v_uid, id_ayam, 20000,  940000, '2026-04-01 07:00'),

    -- MINYAK GORENG
    (gen_random_uuid(), v_uid, id_minyak, 20000, 340000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_minyak, 20000, 360000, '2026-02-25 07:00'),
    (gen_random_uuid(), v_uid, id_minyak, 20000, 370000, '2026-03-20 07:00'),

    -- BAWANG MERAH (volatile — naik lebaran)
    (gen_random_uuid(), v_uid, id_bawang_merah, 5000, 165000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_bawang_merah, 5000, 175000, '2026-02-22 07:00'),
    (gen_random_uuid(), v_uid, id_bawang_merah, 5000, 195000, '2026-03-10 07:00'),
    (gen_random_uuid(), v_uid, id_bawang_merah, 5000, 185000, '2026-04-01 07:00'),

    -- BAWANG PUTIH
    (gen_random_uuid(), v_uid, id_bawang_putih, 5000, 135000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_bawang_putih, 5000, 140000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_bawang_putih, 5000, 145000, '2026-04-01 07:00'),

    -- TELUR AYAM
    (gen_random_uuid(), v_uid, id_telur, 500, 1200000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_telur, 500, 1225000, '2026-02-14 07:00'),
    (gen_random_uuid(), v_uid, id_telur, 500, 1250000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_telur, 500, 1275000, '2026-03-14 07:00'),
    (gen_random_uuid(), v_uid, id_telur, 500, 1250000, '2026-04-01 07:00'),

    -- TEPUNG TERIGU
    (gen_random_uuid(), v_uid, id_tepung, 25000, 245000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_tepung, 25000, 250000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_tepung, 25000, 255000, '2026-04-01 07:00'),

    -- GULA PASIR
    (gen_random_uuid(), v_uid, id_gula, 15000, 200000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_gula, 15000, 210000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_gula, 15000, 217500, '2026-04-01 07:00'),

    -- KOPI ROBUSTA
    (gen_random_uuid(), v_uid, id_kopi, 3000, 345000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_kopi, 3000, 360000, '2026-02-20 07:00'),
    (gen_random_uuid(), v_uid, id_kopi, 3000, 375000, '2026-03-15 07:00'),
    (gen_random_uuid(), v_uid, id_kopi, 3000, 360000, '2026-04-05 07:00'),

    -- SUSU KENTAL MANIS
    (gen_random_uuid(), v_uid, id_susu, 8000, 232000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_susu, 8000, 240000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_susu, 8000, 248000, '2026-04-01 07:00'),

    -- MENTEGA
    (gen_random_uuid(), v_uid, id_mentega, 3000, 228000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_mentega, 3000, 240000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_mentega, 3000, 252000, '2026-04-01 07:00'),

    -- MIE KERING
    (gen_random_uuid(), v_uid, id_mie, 15000, 210000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_mie, 15000, 225000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_mie, 15000, 240000, '2026-04-01 07:00'),

    -- KECAP MANIS
    (gen_random_uuid(), v_uid, id_kecap, 8000, 192000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_kecap, 8000, 200000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_kecap, 8000, 208000, '2026-04-01 07:00'),

    -- CABAI MERAH (paling volatile)
    (gen_random_uuid(), v_uid, id_cabai, 3000, 165000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_cabai, 3000, 180000, '2026-02-20 07:00'),
    (gen_random_uuid(), v_uid, id_cabai, 3000, 210000, '2026-03-10 07:00'),
    (gen_random_uuid(), v_uid, id_cabai, 3000, 195000, '2026-04-01 07:00'),

    -- SANTAN
    (gen_random_uuid(), v_uid, id_santan, 10000, 110000, '2026-02-01 07:00'),
    (gen_random_uuid(), v_uid, id_santan, 10000, 120000, '2026-03-01 07:00'),
    (gen_random_uuid(), v_uid, id_santan, 10000, 130000, '2026-04-01 07:00');

  -- ============================================================
  -- 3. RECIPES
  -- ============================================================
  -- recipes schema: id, user_id, name, created_at (no selling_price column)
  INSERT INTO public.recipes (id, user_id, name, created_at) VALUES
    (id_r1, v_uid, 'Nasi Goreng Spesial', '2026-02-01 09:00'),
    (id_r2, v_uid, 'Ayam Goreng Kremes',  '2026-02-01 09:00'),
    (id_r3, v_uid, 'Es Kopi Susu',        '2026-02-01 09:00'),
    (id_r4, v_uid, 'Mie Goreng',          '2026-02-01 09:00'),
    (id_r5, v_uid, 'Pancake Susu',        '2026-02-05 09:00'),
    (id_r6, v_uid, 'Nasi Ayam Bakar',     '2026-02-05 09:00'),
    (id_r7, v_uid, 'Omelet Spesial',      '2026-02-10 09:00');

  -- ============================================================
  -- 4. RECIPE ITEMS (BoM)
  -- ============================================================
  INSERT INTO public.recipe_items (id, recipe_id, item_id, quantity_used) VALUES
    -- Nasi Goreng Spesial — HPP 9710
    (gen_random_uuid(), id_r1, id_beras,         200),
    (gen_random_uuid(), id_r1, id_ayam,           80),
    (gen_random_uuid(), id_r1, id_telur,           1),
    (gen_random_uuid(), id_r1, id_minyak,         20),
    (gen_random_uuid(), id_r1, id_bawang_merah,    8),
    (gen_random_uuid(), id_r1, id_bawang_putih,    5),
    (gen_random_uuid(), id_r1, id_kecap,          10),
    (gen_random_uuid(), id_r1, id_cabai,           3),

    -- Ayam Goreng Kremes — HPP 10880
    (gen_random_uuid(), id_r2, id_ayam,          200),
    (gen_random_uuid(), id_r2, id_tepung,         30),
    (gen_random_uuid(), id_r2, id_minyak,         80),
    (gen_random_uuid(), id_r2, id_bawang_putih,    5),

    -- Es Kopi Susu — HPP 3650
    (gen_random_uuid(), id_r3, id_kopi,           15),
    (gen_random_uuid(), id_r3, id_susu,           50),
    (gen_random_uuid(), id_r3, id_gula,           25),

    -- Mie Goreng — HPP 4875
    (gen_random_uuid(), id_r4, id_mie,           100),
    (gen_random_uuid(), id_r4, id_telur,           1),
    (gen_random_uuid(), id_r4, id_minyak,         15),
    (gen_random_uuid(), id_r4, id_bawang_merah,    5),
    (gen_random_uuid(), id_r4, id_kecap,          10),
    (gen_random_uuid(), id_r4, id_cabai,           3),

    -- Pancake Susu — HPP 11020
    (gen_random_uuid(), id_r5, id_tepung,        100),
    (gen_random_uuid(), id_r5, id_telur,           2),
    (gen_random_uuid(), id_r5, id_susu,          100),
    (gen_random_uuid(), id_r5, id_gula,           30),
    (gen_random_uuid(), id_r5, id_mentega,        20),

    -- Nasi Ayam Bakar — HPP 13129
    (gen_random_uuid(), id_r6, id_beras,         200),
    (gen_random_uuid(), id_r6, id_ayam,          200),
    (gen_random_uuid(), id_r6, id_santan,         50),
    (gen_random_uuid(), id_r6, id_kecap,          15),
    (gen_random_uuid(), id_r6, id_bawang_merah,   10),
    (gen_random_uuid(), id_r6, id_bawang_putih,    8),
    (gen_random_uuid(), id_r6, id_minyak,         10),

    -- Omelet Spesial — HPP 6880
    (gen_random_uuid(), id_r7, id_telur,           2),
    (gen_random_uuid(), id_r7, id_mentega,        10),
    (gen_random_uuid(), id_r7, id_susu,           30),
    (gen_random_uuid(), id_r7, id_minyak,         10);

  -- ============================================================
  -- 5. SALES — 2 months daily (Feb 14 → Apr 13 2026)
  --    Weekend multiplier 1.5x, weekday 1x
  --    doy % N untuk variasi kuantitas
  -- ============================================================
  FOR d IN
    SELECT gs::date
    FROM generate_series('2026-02-14'::date, '2026-04-13'::date, '1 day') gs
  LOOP
    dow := EXTRACT(DOW FROM d)::int;  -- 0=Sun, 6=Sat
    doy := EXTRACT(DOY FROM d)::int;
    bm  := CASE WHEN dow IN (0, 6) THEN 1.5 ELSE 1.0 END;

    -- Nasi Goreng Spesial (6-10/hari)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r1,
       GREATEST(1, ROUND((6 + (doy % 5)) * bm))::int,
       sp_r1, hpp_r1, sp_r1 - hpp_r1,
       d + ((8  + (doy % 4)) || ' hours')::interval);

    -- Ayam Goreng Kremes (4-8/hari)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r2,
       GREATEST(1, ROUND((4 + (doy % 5)) * bm))::int,
       sp_r2, hpp_r2, sp_r2 - hpp_r2,
       d + ((10 + (doy % 3)) || ' hours')::interval);

    -- Es Kopi Susu (10-18/hari — bestseller)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r3,
       GREATEST(1, ROUND((10 + (doy % 9)) * bm))::int,
       sp_r3, hpp_r3, sp_r3 - hpp_r3,
       d + ((9  + (doy % 5)) || ' hours')::interval);

    -- Mie Goreng (5-9/hari)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r4,
       GREATEST(1, ROUND((5 + (doy % 5)) * bm))::int,
       sp_r4, hpp_r4, sp_r4 - hpp_r4,
       d + ((11 + (doy % 4)) || ' hours')::interval);

    -- Pancake Susu (3-6/hari, mulai Feb 14)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r5,
       GREATEST(1, ROUND((3 + (doy % 4)) * bm))::int,
       sp_r5, hpp_r5, sp_r5 - hpp_r5,
       d + ((7  + (doy % 3)) || ' hours')::interval);

    -- Nasi Ayam Bakar (4-7/hari)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r6,
       GREATEST(1, ROUND((4 + (doy % 4)) * bm))::int,
       sp_r6, hpp_r6, sp_r6 - hpp_r6,
       d + ((12 + (doy % 4)) || ' hours')::interval);

    -- Omelet Spesial (3-5/hari)
    INSERT INTO public.sales (id, user_id, recipe_id, quantity_sold, selling_price, hpp_at_sale, profit, created_at) VALUES
      (gen_random_uuid(), v_uid, id_r7,
       GREATEST(1, ROUND((3 + (doy % 3)) * bm))::int,
       sp_r7, hpp_r7, sp_r7 - hpp_r7,
       d + ((8  + (doy % 3)) || ' hours')::interval);

  END LOOP;

  RAISE NOTICE '✓ Seed complete for user %. Check dashboard!', v_uid;
END;
$$;
