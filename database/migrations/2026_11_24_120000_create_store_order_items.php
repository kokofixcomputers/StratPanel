<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A payment can be for several things (the cart): an order keeps one line for every box or server that was bought or renewed. */
return new class() extends Migration {
    public function up(): void
    {
        Schema::create('store_order_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('order_id');
            $table->unsignedBigInteger('package_id')->nullable();
            // As it was when it was bought.
            $table->string('package_name', 191);
            $table->string('kind', 16);
            $table->json('specs');
            $table->unsignedInteger('amount');
            $table->unsignedInteger('period_days')->nullable();
            $table->boolean('renewal')->default(false);
            // What was made, or what was renewed.
            $table->unsignedBigInteger('box_id')->nullable();
            $table->unsignedInteger('server_id')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->foreign('order_id')->references('id')->on('store_orders')->cascadeOnDelete();
        });

        // The orders made before the cart had one thing each: it becomes their only line.
        foreach (DB::table('store_orders')->get() as $order) {
            DB::table('store_order_items')->insert([
                'order_id' => $order->id,
                'package_id' => $order->package_id,
                'package_name' => $order->package_name,
                'kind' => $order->kind,
                'specs' => $order->specs,
                'amount' => $order->amount,
                'period_days' => $order->period_days,
                'renewal' => $order->renewal,
                'box_id' => $order->box_id,
                'server_id' => $order->server_id,
                'fulfilled_at' => $order->fulfilled_at,
                'error' => $order->error,
                'created_at' => $order->created_at,
                'updated_at' => $order->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('store_order_items');
    }
};
