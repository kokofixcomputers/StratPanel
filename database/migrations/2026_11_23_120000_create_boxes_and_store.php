<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Boxes (resources a person gets that servers are made inside of) and the store that sells them and plain servers (see BoxService, StoreService). */
return new class() extends Migration {
    public function up(): void
    {
        Schema::create('boxes', function (Blueprint $table) {
            $table->id();
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('user_id');
            $table->string('name', 191);
            // The node the servers of the box run on, empty: any node a person may use.
            $table->unsignedInteger('node_id')->nullable();
            // What the box holds: MB, MB, percent, and counts. The servers inside share it.
            $table->unsignedInteger('memory');
            $table->unsignedInteger('disk');
            $table->unsignedInteger('cpu');
            $table->unsignedInteger('allocations')->default(1);
            $table->unsignedInteger('backups')->default(0);
            $table->unsignedInteger('databases')->default(0);
            // active, suspended (by an admin) or expired (not paid for any more).
            $table->string('status', 16)->default('active');
            // admin: made by an admin, order: bought in the store.
            $table->string('source', 16)->default('admin');
            $table->timestamp('expires_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('node_id')->references('id')->on('nodes')->nullOnDelete();
        });

        Schema::table('servers', function (Blueprint $table) {
            // The box the server lives in, and when a bought server has to be paid for again.
            $table->unsignedBigInteger('box_id')->nullable()->index();
            $table->timestamp('expires_at')->nullable();
        });

        Schema::create('store_packages', function (Blueprint $table) {
            $table->id();
            $table->char('uuid', 36)->unique();
            $table->string('name', 191);
            $table->text('description')->nullable();
            // server: a server is made when it is bought. box: a box is made.
            $table->string('kind', 16);
            $table->boolean('active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            // In the smallest unit of the currency (cents) and for how many days one payment lasts, empty: forever.
            $table->unsignedInteger('price');
            $table->unsignedInteger('period_days')->nullable();
            $table->unsignedInteger('memory');
            $table->unsignedInteger('disk');
            $table->unsignedInteger('cpu');
            $table->unsignedInteger('allocations')->default(1);
            $table->unsignedInteger('backups')->default(0);
            $table->unsignedInteger('databases')->default(0);
            $table->unsignedInteger('node_id')->nullable();
            // The egg a bought server starts from, empty: the one new servers get.
            $table->unsignedInteger('egg_id')->nullable();
            $table->timestamps();

            $table->foreign('node_id')->references('id')->on('nodes')->nullOnDelete();
            $table->foreign('egg_id')->references('id')->on('eggs')->nullOnDelete();
        });

        Schema::create('store_orders', function (Blueprint $table) {
            $table->id();
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('user_id');
            $table->unsignedBigInteger('package_id')->nullable();
            // What was bought, as it was when it was bought: the package can change or go away.
            $table->string('package_name', 191);
            $table->string('kind', 16);
            $table->json('specs');
            $table->unsignedInteger('amount');
            $table->char('currency', 3);
            $table->unsignedInteger('period_days')->nullable();
            // stripe or paypal, and what they call this payment.
            $table->string('provider', 16);
            $table->string('provider_reference', 191)->nullable();
            $table->string('provider_payment', 191)->nullable();
            // pending, paid, canceled, failed or refunded.
            $table->string('status', 16)->default('pending');
            // What was made or renewed.
            $table->unsignedBigInteger('box_id')->nullable();
            $table->unsignedInteger('server_id')->nullable();
            $table->boolean('renewal')->default(false);
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'provider_reference']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('package_id')->references('id')->on('store_packages')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_orders');
        Schema::dropIfExists('store_packages');
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn(['box_id', 'expires_at']);
        });
        Schema::dropIfExists('boxes');
    }
};
