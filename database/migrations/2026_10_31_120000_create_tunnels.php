<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Ports of servers that are opened to the internet through a tunnel service (ngrok), so a server can be played without port forwarding. */
return new class() extends Migration {
    public function up(): void
    {
        Schema::create('tunnels', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('allocation_id')->unique();
            // pending (asked of the node), active, or failed (with the reason).
            $table->string('status', 16)->default('pending');
            // Where players connect, host:port, once the tunnel is open.
            $table->string('address')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('allocation_id')->references('id')->on('allocations')->cascadeOnDelete();
        });

        Schema::table('nodes', function (Blueprint $table) {
            // A token of the tunnel service for this node only (encrypted). A free ngrok account lets one agent be online at a time,
            // so every node that opens tunnels needs an account of its own; without one the token of the panel is used.
            $table->text('tunnel_token')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn('tunnel_token');
        });
        Schema::dropIfExists('tunnels');
    }
};
