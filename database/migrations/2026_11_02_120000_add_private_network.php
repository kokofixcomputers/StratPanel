<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A private network between the servers of a person, on every node and across nodes (see PrivateNetworkService). */
return new class() extends Migration {
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            // Whether the node takes part when the private network is on.
            $table->boolean('private_enabled')->default(true);
            // The slice of the range that this node hands its servers addresses from, like 10.99.3.0/24. Made by the panel.
            $table->string('private_subnet', 32)->nullable();
            // The UDP port the node's encrypted tunnel listens on.
            $table->unsignedSmallInteger('private_port')->default(51820);
            // The public key of the node, made and reported by the node itself.
            $table->string('private_public_key', 64)->nullable();
            // How the node says it is doing, and when it last said so.
            $table->string('private_state', 16)->nullable();
            $table->text('private_message')->nullable();
            $table->timestamp('private_reported_at')->nullable();
        });

        Schema::table('servers', function (Blueprint $table) {
            // The address on the private network, once the server has joined it.
            $table->string('private_address', 45)->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropUnique(['private_address']);
            $table->dropColumn('private_address');
        });
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn(['private_enabled', 'private_subnet', 'private_port', 'private_public_key', 'private_state', 'private_message', 'private_reported_at']);
        });
    }
};
