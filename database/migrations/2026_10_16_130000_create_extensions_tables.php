<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

return new class () extends Migration {
    public function up(): void
    {
        // The extensions that are installed. The files are in storage/extensions/<id>, this is what is switched on and how it is set.
        Schema::create('extensions', function (Blueprint $table) {
            $table->increments('id');
            $table->string('ext_id', 48)->unique();
            $table->string('name', 100);
            $table->string('version', 40);
            $table->boolean('enabled')->default(false);
            $table->mediumText('settings')->nullable();
            // The last thing that went wrong in the extension, so the admin page can show it. The panel carried on without it.
            $table->text('last_error')->nullable();
            $table->timestamp('last_error_at')->nullable();
            $table->timestamps();
        });

        // A little key value store every extension may use, so a small extension does not need a migration of its own.
        Schema::create('extension_data', function (Blueprint $table) {
            $table->increments('id');
            $table->string('ext_id', 48);
            $table->string('key', 191);
            $table->mediumText('value')->nullable();
            $table->timestamps();

            $table->unique(['ext_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('extension_data');
        Schema::dropIfExists('extensions');
    }
};
