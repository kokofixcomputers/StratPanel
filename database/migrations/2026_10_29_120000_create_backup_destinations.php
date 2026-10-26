<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Places outside the node where copies of backups are kept (S3, WebDAV, a folder), and the copies that are in them. */
return new class() extends Migration {
    public function up(): void
    {
        Schema::create('backup_destinations', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 191);
            $table->string('type', 16);
            // Where it is and how to log in, as JSON, encrypted.
            $table->text('config');
            $table->boolean('enabled')->default(true);
            // Every new backup is copied here once it is complete.
            $table->boolean('auto_copy')->default(true);
            // The copy on the node is removed once the backup is stored here, only this place has it.
            $table->boolean('delete_local')->default(false);
            // How much of it is kept, for each server: the newest N, no older than N days, no more than N GB together. Empty is no limit.
            $table->unsignedInteger('keep_last')->nullable();
            $table->unsignedInteger('keep_days')->nullable();
            $table->unsignedInteger('max_gb')->nullable();
            $table->timestamps();
        });

        Schema::create('backup_copies', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedBigInteger('backup_id');
            $table->unsignedInteger('destination_id');
            // pending, uploading, stored or failed.
            $table->string('status', 16)->default('pending');
            $table->unsignedBigInteger('bytes')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('stored_at')->nullable();
            $table->timestamps();

            $table->unique(['backup_id', 'destination_id']);
            $table->foreign('backup_id')->references('id')->on('backups')->cascadeOnDelete();
            $table->foreign('destination_id')->references('id')->on('backup_destinations')->cascadeOnDelete();
        });

        Schema::table('backups', function (Blueprint $table) {
            // The file is not on the node any more, only the copies have it.
            $table->boolean('local_removed')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('backups', function (Blueprint $table) {
            $table->dropColumn('local_removed');
        });
        Schema::dropIfExists('backup_copies');
        Schema::dropIfExists('backup_destinations');
    }
};
