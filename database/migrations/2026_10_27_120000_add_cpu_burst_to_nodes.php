<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Whether servers on a node may burst above their CPU limit for short spikes (the kernel's CFS burst), and by how much of their
     * limit. On is what Wings has always done, so existing nodes stay as they are.
     */
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->boolean('cpu_burst_enabled')->default(true);
            $table->unsignedTinyInteger('cpu_burst_percent')->default(100);
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn(['cpu_burst_enabled', 'cpu_burst_percent']);
        });
    }
};
