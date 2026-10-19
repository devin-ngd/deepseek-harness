/** Compare the SDK-derived unsigned archive bitmap with the signed addition without opening signing keys. */
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.jar.JarFile;
import com.ohos.hapsigntool.zip.Zip;
import com.ohos.hapsigntool.codesigning.sign.PageInfoGenerator;
class Phase74PageInfoVerify {
  public static void main(String[] args) throws Exception {
    byte[] actual;
    try (JarFile jar = new JarFile(args[1])) {
      actual = jar.getInputStream(jar.getJarEntry(".pages.info")).readAllBytes();
    }
    Zip zip = new Zip(new File(args[0]));
    zip.alignment(4096);
    byte[] expected = new PageInfoGenerator(zip).generateBitMap();
    if (!Arrays.equals(actual, expected)) throw new IllegalStateException("SDK page bitmap mismatch");
    Files.write(Path.of(args[2]), expected);
  }
}
