#[path = "../../src/helper_sidecar.rs"]
mod helper_sidecar;

fn main() {
    std::process::exit(helper_sidecar::run_cli(std::env::args().skip(1)));
}
