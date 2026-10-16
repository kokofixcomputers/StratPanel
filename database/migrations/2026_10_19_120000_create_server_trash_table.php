<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * What was deleted from a server and can still be recovered. A file or folder is moved into a folder of the server on the node and
     * is described here; a schedule stays in its own table, marked as deleted.
     */
    public function up(): void
    {
        Schema::create('server_trash', function (Blueprint $table) {
            $table->increments('id');
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('server_id');
            // file, directory or schedule
            $table->string('type', 20);
            $table->string('name', 191);
            // Where a file or folder was, the folder it was in. Null for a schedule.
            $table->text('path')->nullable();
            // Bytes of a file, null for a folder (not known without counting it) and a schedule.
            $table->unsignedBigInteger('size')->nullable();
            // The schedule that was deleted, null for files.
            $table->unsignedInteger('schedule_id')->nullable();
            $table->unsignedInteger('deleted_by')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamp('created_at')->nullable();

            $table->foreign('server_id')->references('id')->on('servers')->onDelete('cascade');
            $table->foreign('deleted_by')->references('id')->on('users')->onDelete('set null');
        });

        Schema::table('schedules', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable()->after('updated_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('schedules', function (Blueprint $table) {
            $table->dropColumn('deleted_at');
        });
        Schema::dropIfExists('server_trash');
    }
};
