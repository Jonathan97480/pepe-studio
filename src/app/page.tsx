import Layout from "@/components/Layout";
import { ModelSettingsProvider } from "@/context/ModelSettingsContext";

export default function Home() {
    return (
        <ModelSettingsProvider>
            <Layout />
        </ModelSettingsProvider>
    );
}
