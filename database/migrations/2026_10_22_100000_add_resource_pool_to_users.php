<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * A resource pool is what a user may spend on servers they make themselves: memory (MB), disk (MB), CPU (percent) and allocations. Null
     * means the user has none of their own and gets the defaults of the panel (Admin > Settings > Resource pools), so a change of the
     * defaults reaches everybody who was not given something else.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('pool_memory')->nullable();
            $table->unsignedInteger('pool_disk')->nullable();
            $table->unsignedInteger('pool_cpu')->nullable();
            $table->unsignedInteger('pool_allocations')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pool_memory', 'pool_disk', 'pool_cpu', 'pool_allocations']);
        });
    }
};
