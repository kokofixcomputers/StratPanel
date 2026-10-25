<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A server that was split off another one: the server it came from, whose resources it shares. */
return new class() extends Migration {
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->unsignedInteger('parent_server_id')->nullable()->after('owner_id');
            $table->foreign('parent_server_id')->references('id')->on('servers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropForeign(['parent_server_id']);
            $table->dropColumn('parent_server_id');
        });
    }
};
