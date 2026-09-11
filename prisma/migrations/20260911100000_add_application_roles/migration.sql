INSERT INTO "Permission" ("id", "name", "slug", "description", "createdAt", "updatedAt")
VALUES
    ('10000000-0000-4000-8000-000000000001', 'Student', 'student', 'Can view and create bookings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000002', 'Teacher', 'teacher', 'Can access teacher-level features', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000003', 'Administrator', 'admin', 'Can manage the application', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;
