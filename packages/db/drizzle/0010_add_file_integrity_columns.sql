-- Add checksum and originalSize columns to classroom_files for integrity verification
ALTER TABLE "classroom_files" ADD COLUMN "checksum" text;
ALTER TABLE "classroom_files" ADD COLUMN "original_size" integer;

-- Made with Bob
