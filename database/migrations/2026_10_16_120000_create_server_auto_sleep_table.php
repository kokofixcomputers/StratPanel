<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    /**
     * Run the migrations.
     *
     * A server without a row here has auto sleep off, which is the default.
     */
    public function up(): void
    {
        Schema::create('server_auto_sleep', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('server_id')->unique();
            $table->boolean('enabled')->default(false);
            // How long nobody has to be online before the server is stopped.
            $table->unsignedSmallInteger('idle_minutes')->default(15);
            // Whether a player trying to join through the router starts it again.
            $table->boolean('wake_on_join')->default(true);
            // Since when nobody is online, null while somebody is or while it is not known.
            $table->timestamp('idle_since')->nullable();
            // When the panel stopped the server because it was idle, null once it is awake again. Only a server that was put
            // to sleep this way is started by a player, one that its owner stopped stays off.
            $table->timestamp('slept_at')->nullable();
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('server_auto_sleep');
    }
};
