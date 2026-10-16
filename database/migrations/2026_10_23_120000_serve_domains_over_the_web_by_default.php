<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * A domain is a website as well as a Minecraft address: browsers reach port 80 and 443, players 25565, and the domain leads to the
     * allocation either way. The checkbox stays to turn the website off.
     */
    public function up(): void
    {
        Schema::table('server_domains', function ($table) {
            $table->boolean('web')->default(true)->change();
        });
        DB::table('server_domains')->update(['web' => true]);
    }

    public function down(): void
    {
        Schema::table('server_domains', function ($table) {
            $table->boolean('web')->default(false)->change();
        });
    }
};
