<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration {
    /**
     * The folders a person put their servers in on the dashboard, and the servers they starred. It is theirs alone: another
     * user of the same server sees it in their own folders.
     */
    public function up(): void
    {
        Schema::create('dashboard_folders', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->string('name', 40);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('dashboard_server_prefs', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('folder_id')->nullable();
            $table->boolean('starred')->default(false);
            $table->timestamps();

            $table->unique(['user_id', 'server_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('folder_id')->references('id')->on('dashboard_folders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_server_prefs');
        Schema::dropIfExists('dashboard_folders');
    }
};
