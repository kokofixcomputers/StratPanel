<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('server_domains', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('allocation_id');
            $table->string('domain')->unique();
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->onDelete('cascade');
            $table->foreign('allocation_id')->references('id')->on('allocations')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('server_domains');
    }
};
