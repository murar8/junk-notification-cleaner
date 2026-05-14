{
  description = "junk-notification-cleaner dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system}; in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            glib            # glib-compile-schemas
            gnome-shell     # gnome-extensions CLI
            zip
          ];
        };
      });
}
